import { sha256Hex, safeTokenCompare } from "@bigbangcraft/domain";
import type { AppLogger } from "@bigbangcraft/observability";
import type { DatabaseClient } from "@bigbangcraft/database";
import {
  ensureIntegrationSource,
  createIntegrationEvent,
  touchSourceLastSeen,
} from "@bigbangcraft/database";
import type { QueueSet } from "@bigbangcraft/queue";
import { JOB_NAMES } from "@bigbangcraft/queue";
import type { SpawnDedupService } from "@bigbangcraft/csa-integration";
import {
  validateCsaPayload,
  normalizeCsaEvent,
  parseCidrList,
  isAllowed,
} from "@bigbangcraft/csa-integration";
import type { ProfessorMetrics } from "@bigbangcraft/observability";
import type { AppConfig } from "@bigbangcraft/config";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export function registerCsaRoutes(
  app: FastifyInstance,
  deps: {
    config: AppConfig;
    logger: AppLogger;
    db: DatabaseClient;
    queues: QueueSet;
    dedupService: SpawnDedupService;
    metrics: ProfessorMetrics;
  },
): void {
  const { config, logger, db, queues, dedupService, metrics } = deps;

  app.post(
    "/v1/integrations/csa/:sourceToken",
    {
      bodyLimit: config.CSA_BODY_LIMIT_BYTES,
      config: {
        rateLimit: {
          max: config.CSA_RATE_LIMIT_MAX,
          timeWindow: config.CSA_RATE_LIMIT_WINDOW_SECONDS * 1000,
        },
      },
    },
    async (request: FastifyRequest<{ Params: { sourceToken: string } }>, reply: FastifyReply) => {
      if (config.CSA_INTEGRATION_MODE !== "relay") {
        return reply.status(404).send();
      }

      const token = request.params.sourceToken;
      if (!config.CSA_SOURCE_TOKEN || !token) {
        metrics.csaEventRejectedTotal.labels("invalid-token").inc();
        return reply
          .status(401)
          .send({ error: { code: "CSA_INVALID_TOKEN", message: "Token de origem inválido." } });
      }

      if (!safeTokenCompare(config.CSA_SOURCE_TOKEN, token)) {
        metrics.csaEventRejectedTotal.labels("invalid-token").inc();
        return reply
          .status(401)
          .send({ error: { code: "CSA_INVALID_TOKEN", message: "Token de origem inválido." } });
      }

      const cidrList = parseCidrList(config.CSA_ALLOWED_CIDRS);
      if (cidrList.length > 0) {
        const remoteIp = request.ip;
        if (!remoteIp || !isAllowed(remoteIp, cidrList)) {
          logger.warn({ remoteIp: remoteIp ?? "unknown" }, "Requisição CSA de IP não permitido.");
          metrics.csaEventRejectedTotal.labels("source-ip").inc();
          return reply
            .status(403)
            .send({ error: { code: "CSA_INVALID_SOURCE", message: "Origem não autorizada." } });
        }
      }

      const contentType = request.headers["content-type"] ?? "";
      if (!contentType.includes("application/json")) {
        metrics.csaEventRejectedTotal.labels("content-type").inc();
        return reply.status(415).send({
          error: {
            code: "CSA_INVALID_PAYLOAD",
            message: "Content-Type deve ser application/json.",
          },
        });
      }

      let rawBody: unknown;
      try {
        rawBody = request.body;
      } catch {
        metrics.csaEventRejectedTotal.labels("malformed").inc();
        return reply.status(400).send({
          error: { code: "CSA_INVALID_PAYLOAD", message: "Corpo da requisição inválido." },
        });
      }

      const validation = validateCsaPayload(rawBody);
      if (!validation.ok) {
        metrics.csaEventRejectedTotal.labels("schema").inc();
        return reply
          .status(400)
          .send({ error: { code: validation.code, message: validation.message } });
      }

      const normalizedResult = normalizeCsaEvent(validation.payload, {
        sourceVersion: config.CSA_EXPECTED_SOURCE_VERSION ?? "1.13.2",
        serverId: config.BIGMONCRAFT_SERVER_ID,
        requireMarker: true,
      });
      if (!normalizedResult.ok) {
        metrics.csaParseFailureTotal.inc();
        metrics.csaEventRejectedTotal.labels("marker").inc();
        return reply
          .status(400)
          .send({ error: { code: normalizedResult.code, message: normalizedResult.message } });
      }
      const normalized = normalizedResult.event;

      const source = await ensureIntegrationSource(db, {
        sourceKey: config.BIGMONCRAFT_SERVER_ID,
        displayName: config.BIGMONCRAFT_SERVER_NAME,
        serverId: config.BIGMONCRAFT_SERVER_ID,
        integrationType: "csa",
        expectedVersion: config.CSA_EXPECTED_SOURCE_VERSION ?? "1.13.2",
        tokenHash: config.CSA_SOURCE_TOKEN ? sha256Hex(config.CSA_SOURCE_TOKEN) : undefined,
      });

      if (!source.enabled) {
        metrics.csaEventRejectedTotal.labels("source-disabled").inc();
        return reply.status(403).send({
          error: { code: "CSA_SOURCE_DISABLED", message: "Fonte de integração desabilitada." },
        });
      }

      const dedup = await dedupService.acquire(normalized);
      if (!dedup.accepted) {
        metrics.csaEventDuplicateTotal.labels(config.BIGMONCRAFT_SERVER_ID).inc();
        logger.debug("Evento CSA duplicado — ignorado.");
        return reply.status(204).send();
      }

      const requestId = crypto.randomUUID();
      const sanitizedPayload = sanitizePayloadForStorage(validation.payload);

      const event = await createIntegrationEvent(db, {
        sourceId: source.id,
        requestId,
        fingerprint: dedup.fingerprint,
        schemaVersion: "1.13.2",
        sanitizedPayload,
        normalizedPayload: sanitizeNormalizedEvent(normalized, config),
      });

      if (!event) {
        logger.error("Falha ao persistir integration_event — evento não enfileirado.");
        metrics.csaQueueFailureTotal.inc();
        return reply.status(503).send({
          error: { code: "CSA_STORAGE_FAILURE", message: "Falha ao armazenar o evento." },
        });
      }

      await queues.spawnAlerts.add(JOB_NAMES.PROCESS_CSA_ALERT, {
        eventId: event.id,
        sourceId: event.sourceId,
        sourceVersion: config.CSA_EXPECTED_SOURCE_VERSION ?? "1.13.2",
        serverId: config.BIGMONCRAFT_SERVER_ID,
      });

      await touchSourceLastSeen(db, source.id);
      metrics.csaEventReceivedTotal.labels(config.BIGMONCRAFT_SERVER_ID).inc();
      metrics.csaLastEventTimestamp.set(Date.now());

      return reply.status(204).send();
    },
  );
}

/**
 * Remove campos sensíveis do payload bruto antes da persistência:
 * avatar (URL pode conter segredos), jogador mais próximo e coordenadas
 * quando a política de privacidade padrão (`hidden`) está ativa.
 */
function sanitizePayloadForStorage(payload: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...payload };
  delete copy.avatar_url;
  delete copy.avatarURL;
  if (typeof copy.content === "string") {
    copy.content = copy.content.replace(
      /\/webhooks\/\d+\/[A-Za-z0-9_-]+/g,
      "/webhooks/<redacted>/<redacted>",
    );
  }
  return copy;
}

/**
 * Evento normalizado persistido em `integration_events.normalized_payload`.
 *
 * Privacidade aplicada no armazenamento:
 * - política `hidden` (padrão): coordenadas exatas removidas;
 * - jogador mais próximo removido a menos que SPAWN_SHOW_NEAREST_PLAYER=true
 *   (permanece desabilitado por padrão).
 */
function sanitizeNormalizedEvent(
  event: {
    serverId: string;
    coordinates?: { x?: number; y?: number; z?: number };
    nearestPlayer?: string;
  },
  config: { SPAWN_COORDINATE_POLICY: string; SPAWN_SHOW_NEAREST_PLAYER: boolean },
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(event as Record<string, unknown>) };
  delete copy.rawMessage;
  if (!config.SPAWN_SHOW_NEAREST_PLAYER) {
    delete copy.nearestPlayer;
  }
  if (config.SPAWN_COORDINATE_POLICY === "hidden") {
    delete copy.coordinates;
  } else if (event.coordinates) {
    copy.coordinates = {
      x: event.coordinates.x,
      y: event.coordinates.y,
      z: event.coordinates.z,
    };
  }
  return copy;
}

import { sha256Hex, stableStringify, safeTokenCompare } from "@bigbangcraft/domain";
import type { AppLogger } from "@bigbangcraft/observability";
import type { DatabaseClient } from "@bigbangcraft/database";
import {
  ensureIntegrationSource,
  createIntegrationEvent,
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
  },
): void {
  const { config, logger, db, queues, dedupService } = deps;

  app.post(
    "/v1/integrations/csa/:sourceToken",
    {
      bodyLimit: config.CSA_BODY_LIMIT_BYTES,
    },
    async (request: FastifyRequest<{ Params: { sourceToken: string } }>, reply: FastifyReply) => {
      if (config.CSA_INTEGRATION_MODE !== "relay") {
        return reply.status(404).send();
      }

      const token = request.params.sourceToken;
      if (!config.CSA_SOURCE_TOKEN || !token) {
        return reply
          .status(401)
          .send({ error: { code: "CSA_INVALID_TOKEN", message: "Token de origem inválido." } });
      }

      if (!safeTokenCompare(config.CSA_SOURCE_TOKEN, token)) {
        return reply
          .status(401)
          .send({ error: { code: "CSA_INVALID_TOKEN", message: "Token de origem inválido." } });
      }

      if (config.CSA_ALLOWED_CIDRS) {
        const cidrList = parseCidrList(config.CSA_ALLOWED_CIDRS);
        if (cidrList.length > 0) {
          const remoteIp = request.ip;
          if (!remoteIp || !isAllowed(remoteIp, cidrList)) {
            logger.warn({ remoteIp: remoteIp ?? "unknown" }, "Requisição CSA de IP não permitido.");
            return reply
              .status(403)
              .send({ error: { code: "CSA_INVALID_SOURCE", message: "Origem não autorizada." } });
          }
        }
      }

      const contentType = request.headers["content-type"] ?? "";
      if (!contentType.includes("application/json")) {
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
        return reply.status(400).send({
          error: { code: "CSA_INVALID_PAYLOAD", message: "Corpo da requisição inválido." },
        });
      }

      const validation = validateCsaPayload(rawBody);
      if (!validation.ok) {
        return reply
          .status(400)
          .send({ error: { code: validation.code, message: validation.message } });
      }

      const source = await ensureIntegrationSource(db, {
        sourceKey: config.BIGMONCRAFT_SERVER_ID,
        displayName: config.BIGMONCRAFT_SERVER_NAME,
        serverId: config.BIGMONCRAFT_SERVER_ID,
        tokenHash: config.CSA_SOURCE_TOKEN
          ? sha256Hex(config.CSA_SOURCE_TOKEN)
          : undefined,
      });

      if (!source.enabled) {
        return reply
          .status(403)
          .send({ error: { code: "CSA_SOURCE_DISABLED", message: "Fonte de integração desabilitada." } });
      }

      const normalized = normalizeCsaEvent(validation.payload, {
        sourceVersion: config.CSA_EXPECTED_SOURCE_VERSION ?? "1.13.2",
        serverId: config.BIGMONCRAFT_SERVER_ID,
      });

      const acquired = await dedupService.acquire(normalized);
      if (!acquired) {
        logger.debug("Evento CSA duplicado — ignorado.");
        return reply.status(200).send();
      }

      const requestId = crypto.randomUUID();
      const sanitizedPayload = sanitizePayloadForStorage(validation.payload);
      const fingerprint = sha256Hex(stableStringify(sanitizedPayload));

      const event = await createIntegrationEvent(db, {
        sourceId: source.id,
        requestId,
        fingerprint,
        sanitizedPayload,
      });

      if (event) {
        await queues.spawnAlerts.add(JOB_NAMES.PROCESS_CSA_ALERT, {
          eventId: event.id,
          sourceId: event.sourceId,
          rawPayload: sanitizedPayload,
          sourceVersion: config.CSA_EXPECTED_SOURCE_VERSION ?? "1.13.2",
          serverId: config.BIGMONCRAFT_SERVER_ID,
        });
      }

      return reply.status(200).send();
    },
  );
}

function sanitizePayloadForStorage(payload: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...payload };
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

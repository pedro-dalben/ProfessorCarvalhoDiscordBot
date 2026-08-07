import { sha256Hex, safeTokenCompare, type SpawnLifecycleEvent, type SpawnLifecycleStatus } from "@bigbangcraft/domain";
import { isTransitionAllowed, isTerminalStatus } from "@bigbangcraft/domain";
import type { AppLogger } from "@bigbangcraft/observability";
import type { DatabaseClient } from "@bigbangcraft/database";
import {
  ensureIntegrationSource,
  createIntegrationEvent,
  findSpawnByExternalId,
  applyLifecycleTransition,
  insertLifecycleHistory,
  touchSourceLastSeen,
  storeGameEvent,
  processCaptureEvent,
  processRareCapturedEvent,
} from "@bigbangcraft/database";
import { findActiveIdentity } from "@bigbangcraft/database";
import { identityLinks } from "@bigbangcraft/database";
import { eq, and } from "drizzle-orm";
import type { QueueSet } from "@bigbangcraft/queue";
import { JOB_NAMES } from "@bigbangcraft/queue";
import {
  validateCsaPayload,
  parseCidrList,
  isAllowed,
  normalizeBbsaEvent,
} from "@bigbangcraft/csa-integration";
import type { ProfessorMetrics } from "@bigbangcraft/observability";
import type { AppConfig } from "@bigbangcraft/config";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export function registerBbsaRoutes(
  app: FastifyInstance,
  deps: {
    config: AppConfig;
    logger: AppLogger;
    db: DatabaseClient;
    queues: QueueSet;
    metrics: ProfessorMetrics;
  },
): void {
    const { config, logger, db, queues, metrics: _metrics } = deps;

  app.post(
    "/v1/integrations/bigbang-spawn-alerts/:sourceToken",
    {
      bodyLimit: config.BBSA_BODY_LIMIT_BYTES,
      config: {
        rateLimit: {
          max: config.BBSA_RATE_LIMIT_MAX,
          timeWindow: config.BBSA_RATE_LIMIT_WINDOW_SECONDS * 1000,
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { sourceToken: string } }>,
      reply: FastifyReply,
    ) => {
      if (config.BBSA_INTEGRATION_MODE !== "relay") {
        return reply.status(404).send();
      }

      const token = request.params.sourceToken;
      if (!config.BBSA_SOURCE_TOKEN || !token) {
        return reply
          .status(401)
          .send({ error: { code: "BBSA_INVALID_TOKEN", message: "Token de origem inválido." } });
      }

      if (!safeTokenCompare(config.BBSA_SOURCE_TOKEN, token)) {
        return reply
          .status(401)
          .send({ error: { code: "BBSA_INVALID_TOKEN", message: "Token de origem inválido." } });
      }

      const cidrList = parseCidrList(config.BBSA_ALLOWED_CIDRS);
      if (cidrList.length > 0) {
        const remoteIp = request.ip;
        if (!remoteIp || !isAllowed(remoteIp, cidrList)) {
          logger.warn({ remoteIp: remoteIp ?? "unknown" }, "Requisição BBSA de IP não permitido.");
          return reply
            .status(403)
            .send({ error: { code: "BBSA_INVALID_SOURCE", message: "Origem não autorizada." } });
        }
      }

      const contentType = request.headers["content-type"] ?? "";
      if (!contentType.includes("application/json")) {
        return reply.status(415).send({
          error: { code: "BBSA_INVALID_PAYLOAD", message: "Content-Type deve ser application/json." },
        });
      }

      let rawBody: unknown;
      try {
        rawBody = request.body;
      } catch {
        return reply.status(400).send({
          error: { code: "BBSA_INVALID_PAYLOAD", message: "Corpo da requisição inválido." },
        });
      }

      const validation = validateCsaPayload(rawBody);
      if (!validation.ok) {
        return reply.status(400).send({ error: { code: validation.code, message: validation.message } });
      }

      const normalizedResult = normalizeBbsaEvent(validation.payload, {
        sourceVersion: config.BBSA_EXPECTED_VERSION,
        serverId: config.BIGMONCRAFT_SERVER_ID,
      });
      if (!normalizedResult.ok) {
        return reply
          .status(400)
          .send({ error: { code: normalizedResult.code, message: normalizedResult.message } });
      }
      const event = normalizedResult.event;

      const source = await ensureIntegrationSource(db, {
        sourceKey: `${config.BIGMONCRAFT_SERVER_ID}-bbsa`,
        displayName: `${config.BIGMONCRAFT_SERVER_NAME} (BigBangSpawnAlerts)`,
        serverId: config.BIGMONCRAFT_SERVER_ID,
        integrationType: "bigbang-spawn-alerts",
        expectedVersion: config.BBSA_EXPECTED_VERSION,
        tokenHash: config.BBSA_SOURCE_TOKEN ? sha256Hex(config.BBSA_SOURCE_TOKEN) : undefined,
      });

      if (!source.enabled) {
        return reply.status(403).send({
          error: { code: "BBSA_SOURCE_DISABLED", message: "Fonte de integração desabilitada." },
        });
      }

      const existing = await findSpawnByExternalId(db, config.BIGMONCRAFT_SERVER_ID, event.spawnAlertId);
      if (existing) {
        logger.warn(
          { spawnAlertId: event.spawnAlertId, status: event.status },
          "BBSA spawn_alert_id já existe — POST repetido.",
        );
        if (existing.lifecycleStatus !== event.status) {
          return reply.status(409).send({
            error: {
              code: "SPAWN_ALERT_CONFLICT",
              message: `spawnAlertId ${event.spawnAlertId} já existe com status ${existing.lifecycleStatus}, recebido ${event.status}.`,
            },
          });
        }
        return reply.status(200).send({ id: event.spawnAlertId });
      }

      const requestId = crypto.randomUUID();
      const sanitizedPayload = sanitizeBbsaPayload(validation.payload);
      const normalizedPayload = sanitizeBbsaNormalizedEvent(event, config);

      const fingerprint = sha256Hex(
        JSON.stringify({ server: config.BIGMONCRAFT_SERVER_ID, spawnAlertId: event.spawnAlertId }),
      );

      const integrationEvent = await createIntegrationEvent(db, {
        sourceId: source.id,
        requestId,
        fingerprint,
        schemaVersion: config.BBSA_EXPECTED_VERSION,
        sanitizedPayload,
        normalizedPayload,
      });

      if (!integrationEvent) {
        logger.error("Falha ao persistir integration_event BBSA.");
        return reply.status(503).send({
          error: { code: "BBSA_STORAGE_FAILURE", message: "Falha ao armazenar o evento." },
        });
      }

      await queues.bbsaAlerts.add(JOB_NAMES.PROCESS_BBSA_ALERT, {
        eventId: integrationEvent.id,
        sourceId: integrationEvent.sourceId,
        sourceVersion: config.BBSA_EXPECTED_VERSION,
        serverId: config.BIGMONCRAFT_SERVER_ID,
      });

      await touchSourceLastSeen(db, source.id);

      logger.info(
        { spawnAlertId: event.spawnAlertId, species: event.species },
        "BBSA alerta inicial aceito.",
      );

      return reply.status(200).send({ id: event.spawnAlertId });
    },
  );

  app.patch(
    "/v1/integrations/bigbang-spawn-alerts/:sourceToken/messages/:relayMessageId",
    {
      bodyLimit: config.BBSA_BODY_LIMIT_BYTES,
      config: {
        rateLimit: {
          max: config.BBSA_RATE_LIMIT_MAX,
          timeWindow: config.BBSA_RATE_LIMIT_WINDOW_SECONDS * 1000,
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { sourceToken: string; relayMessageId: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (config.BBSA_INTEGRATION_MODE !== "relay") {
        return reply.status(404).send();
      }

      const token = request.params.sourceToken;
      if (!config.BBSA_SOURCE_TOKEN || !token || !safeTokenCompare(config.BBSA_SOURCE_TOKEN, token)) {
        return reply
          .status(401)
          .send({ error: { code: "BBSA_INVALID_TOKEN", message: "Token de origem inválido." } });
      }

      const cidrList = parseCidrList(config.BBSA_ALLOWED_CIDRS);
      if (cidrList.length > 0) {
        const remoteIp = request.ip;
        if (!remoteIp || !isAllowed(remoteIp, cidrList)) {
          return reply
            .status(403)
            .send({ error: { code: "BBSA_INVALID_SOURCE", message: "Origem não autorizada." } });
        }
      }

      const contentType = request.headers["content-type"] ?? "";
      if (!contentType.includes("application/json")) {
        return reply.status(415).send({
          error: { code: "BBSA_INVALID_PAYLOAD", message: "Content-Type deve ser application/json." },
        });
      }

      let rawBody: unknown;
      try {
        rawBody = request.body;
      } catch {
        return reply.status(400).send({
          error: { code: "BBSA_INVALID_PAYLOAD", message: "Corpo da requisição inválido." },
        });
      }

      const validation = validateCsaPayload(rawBody);
      if (!validation.ok) {
        return reply.status(400).send({ error: { code: validation.code, message: validation.message } });
      }

      const normalizedResult = normalizeBbsaEvent(validation.payload, {
        sourceVersion: config.BBSA_EXPECTED_VERSION,
        serverId: config.BIGMONCRAFT_SERVER_ID,
      });
      if (!normalizedResult.ok) {
        return reply
          .status(400)
          .send({ error: { code: normalizedResult.code, message: normalizedResult.message } });
      }
      const event = normalizedResult.event;

      const relayId = request.params.relayMessageId;
      if (event.spawnAlertId !== relayId) {
        return reply.status(409).send({
          error: {
            code: "SPAWN_ALERT_ID_MISMATCH",
            message: "relayMessageId na URL não corresponde ao spawnAlertId no payload.",
          },
        });
      }

      const existing = await findSpawnByExternalId(db, config.BIGMONCRAFT_SERVER_ID, event.spawnAlertId);
      if (!existing) {
        return reply.status(404).send({
          error: {
            code: "SPAWN_ALERT_NOT_FOUND",
            message: `Alerta ${event.spawnAlertId} não encontrado. POST anterior?`,
          },
        });
      }

      const fromStatus = (existing.lifecycleStatus ?? "SPAWNED") as SpawnLifecycleStatus;
      const toStatus = event.status;

      if (!isTransitionAllowed(fromStatus, toStatus)) {
        const historyEntry = {
          spawnEventId: existing.id,
          externalSpawnAlertId: event.spawnAlertId,
          status: toStatus,
          revision: existing.lifecycleRevision ?? 0,
          occurredAt: new Date(),
          playerName: event.playerName,
          payloadHash: sha256Hex(JSON.stringify(event)),
          normalizedPayload: sanitizeBbsaNormalizedEvent(event, config),
          applied: false,
          rejectionReason: `Transição inválida: ${fromStatus} -> ${toStatus}`,
        };

        await insertLifecycleHistory(db, historyEntry);

        return reply.status(409).send({
          error: {
            code: "INVALID_LIFECYCLE_TRANSITION",
            message: `Transição de ${fromStatus} para ${toStatus} não é permitida.`,
          },
        });
      }

      const newRevision = (existing.lifecycleRevision ?? 0) + 1;
      const resolvedAt = isTerminalStatus(toStatus) ? new Date() : undefined;

      const historyPayload = sanitizeBbsaNormalizedEvent(event, config);
      const payloadHash = sha256Hex(JSON.stringify(event));

      await insertLifecycleHistory(db, {
        spawnEventId: existing.id,
        externalSpawnAlertId: event.spawnAlertId,
        status: toStatus,
        revision: newRevision,
        occurredAt: existing.spawnedAt ?? new Date(),
        playerName: event.playerName,
        payloadHash,
        normalizedPayload: historyPayload,
        applied: false,
      });

      const updated = await applyLifecycleTransition(db, existing.id, toStatus, newRevision, {
        involvedPlayerName: event.playerName,
        resolvedAt,
      });

      if (!updated) {
        logger.warn(
          { spawnAlertId: event.spawnAlertId, fromStatus, toStatus, revision: newRevision },
          "Transição de lifecycle não aplicada — concorrência detectada.",
        );
        return reply.status(204).send();
      }

      void processBbsaLifecycleForJourney(db, event, toStatus, updated, config).catch((err) => {
        logger.error({ err, spawnAlertId: event.spawnAlertId }, "Falha ao criar GameEvent de BBSA.");
      });

      if (updated.discordChannelId && updated.discordMessageId) {
        await queues.bbsaEdits.add(JOB_NAMES.EDIT_BBSA_SPAWN_ALERT, {
          spawnEventId: updated.id,
          channelId: updated.discordChannelId,
          messageId: updated.discordMessageId,
          expectedRevision: newRevision,
          coordinatePolicy: config.SPAWN_COORDINATE_POLICY,
          regionGridSize: config.SPAWN_REGION_GRID_SIZE,
          serverAddress: config.BIGMONCRAFT_SERVER_ADDRESS,
        });
      }

      logger.info(
        { spawnAlertId: event.spawnAlertId, fromStatus, toStatus, revision: newRevision },
        "BBSA transição de lifecycle aceita.",
      );

      return reply.status(204).send();
    },
  );
}

function sanitizeBbsaPayload(payload: Record<string, unknown>): Record<string, unknown> {
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

function sanitizeBbsaNormalizedEvent(
  event: SpawnLifecycleEvent,
  config: { SPAWN_COORDINATE_POLICY: string },
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...event };
  if (config.SPAWN_COORDINATE_POLICY === "hidden") {
    delete copy.coordinates;
  }
  return copy;
}

async function processBbsaLifecycleForJourney(
  db: DatabaseClient,
  event: SpawnLifecycleEvent & { species?: string; displayName?: string },
  toStatus: string,
  updated: Awaited<ReturnType<typeof applyLifecycleTransition>>,
  config: AppConfig,
): Promise<void> {
  if (!updated) return;

  let minecraftUuid: string | undefined;
  let linkId: string | undefined;

  if (event.playerName) {
    const link = await getOrResolveIdentity(db, event.playerName);
    if (link) {
      minecraftUuid = link.minecraftUuid;
      linkId = link.linkId;
    }
  }

  const eventId = `bbsa:${event.spawnAlertId}:${toStatus}`;

  const species = event.species ?? event.displayName ?? updated.species ?? undefined;
  const payload: Record<string, unknown> = {
    species,
    form: event.form ?? updated.form ?? null,
    dexNumber: event.dexNumber ?? updated.dexNumber,
    level: event.level ?? updated.level,
    shiny: event.shiny ?? updated.shiny ?? false,
    legendary: event.legendary ?? updated.legendary ?? false,
    mythical: event.mythical ?? updated.mythical ?? false,
    ultraBeast: event.ultraBeast ?? updated.ultraBeast ?? false,
    paradox: event.paradox ?? updated.paradox ?? false,
    rarity: event.rarity ?? updated.rarity ?? null,
    spawnAlertId: event.spawnAlertId,
    playerName: event.playerName ?? null,
    occurredAt: new Date().toISOString(),
  };

  const gameEventType = `pokemon.rare.${toStatus.toLowerCase()}`;

  const result = await storeGameEvent({ db }, {
    eventId,
    eventType: gameEventType,
    schemaVersion: "1.0",
    serverId: config.BIGMONCRAFT_SERVER_ID,
    source: "bigbang-spawn-alerts",
    sourceEventId: `${event.spawnAlertId}:${toStatus}`,
    minecraftUuid,
    identityLinkId: linkId,
    occurredAt: new Date(),
    payload,
  });

  if (!result.dbId || result.duplicate) return;
  if (!minecraftUuid) return;

  if (toStatus === "CAPTURED") {
    await processRareCapturedEvent({ db }, result.dbId, minecraftUuid, linkId, payload);
  }
}

async function getOrResolveIdentity(
  db: DatabaseClient,
  playerName: string,
): Promise<{ minecraftUuid: string; linkId: string } | null> {
  const { identityLinks } = await import("@bigbangcraft/database");
  const { eq, and, desc } = await import("drizzle-orm");
  const rows = await db
    .select({ minecraftUuid: identityLinks.minecraftUuid, linkId: identityLinks.id, linkedAt: identityLinks.linkedAt })
    .from(identityLinks)
    .where(
      and(
        eq(identityLinks.minecraftName, playerName),
        eq(identityLinks.status, "active"),
      ),
    )
    .orderBy(desc(identityLinks.linkedAt))
    .limit(1);

  if (rows[0]) {
    return { minecraftUuid: rows[0].minecraftUuid, linkId: rows[0].linkId };
  }
  return null;
}

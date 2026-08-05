import { safeTokenCompare, sha256Hex, stableStringify } from "@bigbangcraft/domain";
import { validateCsaPayload, parseCidrList, isAllowed } from "@bigbangcraft/csa-integration";
import type { AppLogger } from "@bigbangcraft/observability";
import type { DatabaseClient } from "@bigbangcraft/database";
import { createIntegrationEvent, findSourceByKey } from "@bigbangcraft/database";
import type { QueueSet } from "@bigbangcraft/queue";
import { JOB_NAMES } from "@bigbangcraft/queue";
import type { SpawnDedupService } from "@bigbangcraft/csa-integration";
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
        return reply
          .status(415)
          .send({
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
        return reply
          .status(400)
          .send({
            error: { code: "CSA_INVALID_PAYLOAD", message: "Corpo da requisição inválido." },
          });
      }

      const validation = validateCsaPayload(rawBody);
      if (!validation.ok) {
        return reply
          .status(400)
          .send({ error: { code: validation.code, message: validation.message } });
      }

      const requestId = crypto.randomUUID();
      const sanitizedPayload = sanitizePayloadForStorage(validation.payload);
      const fingerprint = sha256Hex(stableStringify(sanitizedPayload));

      const isDuplicate = await dedupService.isDuplicate({
        source: "csa",
        serverId: config.BIGMONCRAFT_SERVER_ID,
        receivedAt: new Date().toISOString(),
        bucket: extractBucket(validation.payload),
      });

      if (isDuplicate) {
        logger.debug({ requestId, fingerprint }, "Evento CSA duplicado — ignorado.");
        return reply.status(200).send();
      }

      await dedupService.markDuplicate({
        source: "csa",
        serverId: config.BIGMONCRAFT_SERVER_ID,
        receivedAt: new Date().toISOString(),
        bucket: extractBucket(validation.payload),
      });

      const source = await findSourceByKey(db, config.BIGMONCRAFT_SERVER_ID);
      const sourceId = source?.id ?? "00000000-0000-0000-0000-000000000000";

      const event = await createIntegrationEvent(db, {
        sourceId,
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

function extractBucket(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.content === "string") {
    const match = /bucket=([^|]+)/.exec(payload.content);
    if (match && match[1]) return match[1].trim();
  }
  return undefined;
}

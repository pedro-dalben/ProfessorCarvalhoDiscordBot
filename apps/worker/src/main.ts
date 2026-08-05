import "dotenv/config";
import { randomUUID } from "node:crypto";
import { parseEnv } from "@bigbangcraft/config";
import { createLogger, createMetrics, ShutdownManager } from "@bigbangcraft/observability";
import {
  createDatabaseClient,
  createSpawnEvent,
  findSpawnEventByIntegrationEventId,
  cleanupExpiredEvents,
  markEventProcessed,
  markEventFailed,
} from "@bigbangcraft/database";
import {
  createRedisClient,
  createQueues,
  JOB_NAMES,
  QUEUE_NAMES,
  type ProcessCsaAlertPayload,
  type DeliverDiscordSpawnAlertPayload,
  type CleanupExpiredEventsPayload,
} from "@bigbangcraft/queue";
import { Worker, type Job } from "bullmq";
import { normalizeCsaEvent, type CsaWebhookPayload } from "@bigbangcraft/csa-integration";
import { buildSpawnAlertEmbed } from "@bigbangcraft/discord-ui";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";

function main(): void {
  const config = parseEnv();
  const logger = createLogger({
    serviceName: "worker",
    environment: config.NODE_ENV,
    version: config.APP_VERSION,
    level: config.LOG_LEVEL,
  });
  const metrics = createMetrics({ includeDefaultMetrics: false });

  const { db, pool } = createDatabaseClient({
    connectionString: config.DATABASE_URL,
    poolMax: 2,
    connectionTimeoutMs: config.DATABASE_CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: config.DATABASE_STATEMENT_TIMEOUT_MS,
  });

  const redisClient = createRedisClient({
    redisUrl: config.REDIS_URL,
    redisPassword: config.REDIS_PASSWORD ?? "",
    keyPrefix: config.REDIS_KEY_PREFIX,
  });
  const queues = createQueues(redisClient, config.REDIS_KEY_PREFIX);

  const spawnWorker = new Worker<ProcessCsaAlertPayload>(
    QUEUE_NAMES.SPAWN_ALERTS,
    async (job: Job<ProcessCsaAlertPayload>) => {
      const { eventId, rawPayload, sourceVersion, serverId } = job.data;
      logger.info({ eventId }, "Processando alerta CSA.");

      const payload = rawPayload as unknown as CsaWebhookPayload;
      const event = normalizeCsaEvent(payload, { sourceVersion, serverId });

      if (config.SPAWN_COORDINATE_POLICY === "hidden") {
        event.coordinates = undefined;
      } else if (config.SPAWN_COORDINATE_POLICY === "region") {
        // coordinates preserved for region-based delivery
      } else {
        if (!config.SPAWN_STORE_EXACT_COORDINATES) {
          event.coordinates = undefined;
        }
      }

      if (!config.SPAWN_SHOW_NEAREST_PLAYER) {
        event.nearestPlayer = undefined;
      }

      const existing = await findSpawnEventByIntegrationEventId(db, eventId);
      if (existing) {
        logger.info({ eventId }, "spawn_events já existe para este integration_event — idempotente.");
        await markEventProcessed(db, eventId);
        return;
      }

      const spawnEvent = await createSpawnEvent(db, {
        integrationEventId: eventId,
        serverId: event.serverId,
        species: event.species,
        form: event.form,
        dexNumber: event.dexNumber,
        level: event.level,
        shiny: event.shiny,
        legendary: event.legendary,
        mythical: event.mythical,
        ultraBeast: event.ultraBeast,
        paradox: event.paradox,
        rarity: event.rarity,
        bucket: event.bucket,
        biome: event.biome,
        dimension: event.dimension,
        coordinateRegion:
          event.coordinates?.x !== undefined && event.coordinates?.z !== undefined
            ? `${event.coordinates.x},${event.coordinates.z}`
            : undefined,
        occurredAt: new Date(event.receivedAt),
      });

      await markEventProcessed(db, eventId);

      const alertChannelId = config.DISCORD_SPAWN_ALERT_CHANNEL_ID;
      if (alertChannelId && config.DISCORD_TOKEN) {
        const roleIds: string[] = [];
        if (event.shiny && config.DISCORD_SHINY_ALERT_ROLE_ID) {
          roleIds.push(config.DISCORD_SHINY_ALERT_ROLE_ID);
        }
        if (
          (event.legendary || event.mythical || event.ultraBeast) &&
          config.DISCORD_LEGENDARY_ALERT_ROLE_ID
        ) {
          roleIds.push(config.DISCORD_LEGENDARY_ALERT_ROLE_ID);
        }

        await queues.spawnDelivery.add(JOB_NAMES.DELIVER_DISCORD_SPAWN_ALERT, {
          spawnEventId: spawnEvent?.id ?? eventId,
          channelId: alertChannelId,
          roleIds,
          coordinatePolicy: config.SPAWN_COORDINATE_POLICY,
          regionGridSize: config.SPAWN_REGION_GRID_SIZE,
          showNearestPlayer: config.SPAWN_SHOW_NEAREST_PLAYER,
          serverAddress: config.BIGMONCRAFT_SERVER_ADDRESS,
        });
      }

      logger.info({ eventId, species: event.species }, "Alerta CSA processado.");
    },
    {
      connection: redisClient,
      prefix: config.REDIS_KEY_PREFIX,
      concurrency: 4,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 7 * 86400 },
    },
  );

  spawnWorker.on("failed", (job: Job<ProcessCsaAlertPayload> | undefined, error: Error) => {
    if (job) {
      const attemptsMade = job.attemptsMade;
      const maxAttempts = job.opts.attempts ?? 3;
      logger.error(
        { eventId: job.data.eventId, attemptsMade, maxAttempts, err: error },
        "Job process-csa-alert falhou.",
      );
      if (attemptsMade >= maxAttempts) {
        void markEventFailed(db, job.data.eventId, "CSA_PROCESSING_FAILED");
      }
    }
  });

  const deliveryWorker = new Worker<DeliverDiscordSpawnAlertPayload>(
    QUEUE_NAMES.SPAWN_DELIVERY,
    async (job: Job<DeliverDiscordSpawnAlertPayload>) => {
      const {
        spawnEventId,
        channelId,
        roleIds,
        coordinatePolicy,
        regionGridSize,
        showNearestPlayer,
        serverAddress,
      } = job.data;

      if (!config.DISCORD_TOKEN) {
        logger.warn("DISCORD_TOKEN não configurado. Entrega de alerta ignorada.");
        return;
      }

      const importDeps = await import("@bigbangcraft/database");
      const dbClient = db;
      const spawnRow = await importDeps.findSpawnEventByIntegrationEventId(dbClient, spawnEventId);

      const embed = buildSpawnAlertEmbed(
        {
          source: "csa",
          sourceVersion: config.CSA_EXPECTED_SOURCE_VERSION,
          serverId: config.BIGMONCRAFT_SERVER_ID,
          receivedAt: spawnRow?.occurredAt?.toISOString() ?? new Date().toISOString(),
          species: spawnRow?.species ?? undefined,
          displayName: spawnRow?.species ?? undefined,
          dexNumber: spawnRow?.dexNumber ?? undefined,
          level: spawnRow?.level ?? undefined,
          shiny: spawnRow?.shiny ?? false,
          legendary: spawnRow?.legendary ?? false,
          mythical: spawnRow?.mythical ?? false,
          ultraBeast: spawnRow?.ultraBeast ?? false,
          paradox: spawnRow?.paradox ?? false,
          bucket: spawnRow?.bucket ?? undefined,
          biome: spawnRow?.biome ?? undefined,
          dimension: spawnRow?.dimension ?? undefined,
          coordinates:
            spawnRow?.coordinateRegion
              ? {
                  x: parseCoordinate(spawnRow.coordinateRegion, "x"),
                  z: parseCoordinate(spawnRow.coordinateRegion, "z"),
                }
              : undefined,
        },
        { coordinatePolicy, regionGridSize, showNearestPlayer, serverAddress },
      );

      if (!embed) return;

      const allowedMentions = {
        parse: [] as never[],
        roles: roleIds.filter(Boolean),
      };

      const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

      try {
        await rest.post(Routes.channelMessages(channelId), {
          body: {
            embeds: [embed],
            allowed_mentions: allowedMentions,
          },
        });
        const tierLabel = embed.title.includes("shiny")
          ? "shiny"
          : embed.title.includes("raro") || embed.title.includes("legendary")
            ? "rare"
            : "standard";
        metrics.spawnAlertDeliveredTotal.labels(tierLabel, config.BIGMONCRAFT_SERVER_ID).inc();
        logger.info({ channelId, spawnEventId }, "Alerta de spawn entregue no Discord.");
      } catch (error) {
        metrics.spawnAlertFailedTotal.labels("discord-error", "delivery").inc();
        logger.error({ err: error, channelId, spawnEventId }, "Falha ao entregar alerta no Discord.");
        throw error;
      }
    },
    {
      connection: redisClient,
      prefix: config.REDIS_KEY_PREFIX,
      concurrency: 2,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 7 * 86400 },
    },
  );

  const maintenanceWorker = new Worker<CleanupExpiredEventsPayload>(
    QUEUE_NAMES.MAINTENANCE,
    async () => {
      const deleted = await cleanupExpiredEvents(db, config.CSA_STORE_SANITIZED_PAYLOAD_DAYS);
      logger.info({ deleted }, "Limpeza de eventos expirados concluída.");
    },
    {
      connection: redisClient,
      prefix: config.REDIS_KEY_PREFIX,
    },
  );

  const heartbeatInstanceId = randomUUID();
  setInterval(() => {
    void (async () => {
      try {
        await redisClient.set(
          `${config.REDIS_KEY_PREFIX}heartbeat:worker:${heartbeatInstanceId}`,
          Date.now().toString(),
          "EX",
          60,
        );
        metrics.workerHeartbeatTimestamp.labels(heartbeatInstanceId).set(Date.now());
      } catch {
        // heartbeat best-effort; ignore failures
      }
    })();
  }, 15000);

  const shutdownManager = new ShutdownManager(logger, config.SHUTDOWN_TIMEOUT_MS);
  shutdownManager.register("spawnWorker", () => spawnWorker.close());
  shutdownManager.register("deliveryWorker", () => deliveryWorker.close());
  shutdownManager.register("maintenanceWorker", () => maintenanceWorker.close());
  shutdownManager.register("queues", async () => {
    await Promise.all([
      queues.spawnAlerts.close(),
      queues.spawnDelivery.close(),
      queues.maintenance.close(),
      queues.usageAggregation.close(),
    ]);
  });
  shutdownManager.register("redis", async () => {
    await redisClient.quit();
  });
  shutdownManager.register("db", async () => {
    await pool.end();
  });
  shutdownManager.installSignalHandlers();

  logger.info("Professor Carvalho (worker) pronto.");
}

function parseCoordinate(region: string, axis: "x" | "z"): number | undefined {
  const parts = region.split(",");
  const raw = axis === "x" ? parts[0] : parts[1];
  if (!raw) return undefined;
  const num = Number.parseFloat(raw);
  return Number.isFinite(num) ? num : undefined;
}

process.on("uncaughtException", (error) => {
  console.error("Exceção não capturada no worker:", error);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("Rejeição não tratada no worker:", reason);
  process.exit(1);
});

try {
  main();
} catch (error) {
  console.error("Falha fatal no worker:", error);
  process.exit(1);
}

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { parseEnv } from "@bigbangcraft/config";
import { createLogger, createMetrics, ShutdownManager } from "@bigbangcraft/observability";
import {
  createDatabaseClient,
  cleanupExpiredEvents,
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
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import { processCsaJob, deliverDiscordJob, type DiscordSender } from "./handlers.js";

function createDiscordSender(token: string): DiscordSender {
  const rest = new REST({ version: "10" }).setToken(token);
  return {
    async send(channelId, body) {
      const result = (await rest.post(Routes.channelMessages(channelId), {
        body,
      })) as { id: string };
      return { id: result.id };
    },
  };
}

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

  const discordSender = config.DISCORD_TOKEN ? createDiscordSender(config.DISCORD_TOKEN) : null;

  const spawnWorker = new Worker<ProcessCsaAlertPayload>(
    QUEUE_NAMES.SPAWN_ALERTS,
    async (job: Job<ProcessCsaAlertPayload>) => {
      const { eventId, sourceId, sourceVersion, serverId } = job.data;
      logger.info({ eventId, sourceId }, "Processando alerta CSA.");

      const result = await processCsaJob(
        db,
        config,
        { eventId, sourceId, sourceVersion, serverId },
        async (deliveryJob) => {
          await queues.spawnDelivery.add(JOB_NAMES.DELIVER_DISCORD_SPAWN_ALERT, deliveryJob);
        },
      );

      logger.info(
        { eventId, spawnEventId: result.spawnEventId, skipped: result.skipped },
        "Alerta CSA processado.",
      );
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
      const data = job.data;

      if (!discordSender) {
        logger.warn("DISCORD_TOKEN não configurado. Entrega de alerta ignorada.");
        return;
      }

      const result = await deliverDiscordJob(db, discordSender, metrics, config, data);
      logger.info(
        {
          spawnEventId: data.spawnEventId,
          delivered: result.delivered,
          discordMessageId: result.discordMessageId,
        },
        "Resultado da entrega de alerta de spawn.",
      );
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

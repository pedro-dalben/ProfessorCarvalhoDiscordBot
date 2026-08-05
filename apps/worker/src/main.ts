import "dotenv/config";
import { randomUUID } from "node:crypto";
import { parseEnv } from "@bigbangcraft/config";
import { createLogger, createMetrics, ShutdownManager } from "@bigbangcraft/observability";
import {
  createDatabaseClient,
  createSpawnEvent,
  cleanupExpiredEvents,
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
import {
  normalizeCsaEvent,
  type CsaWebhookPayload,
} from "@bigbangcraft/csa-integration";
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

  const alertChannelId = config.DISCORD_SPAWN_ALERT_CHANNEL_ID;
  const alertRoleIds: string[] = [];
  if (config.DISCORD_SHINY_ALERT_ROLE_ID) alertRoleIds.push(config.DISCORD_SHINY_ALERT_ROLE_ID);
  if (config.DISCORD_LEGENDARY_ALERT_ROLE_ID)
    alertRoleIds.push(config.DISCORD_LEGENDARY_ALERT_ROLE_ID);

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
        // coordinates preserved as-is for region-based delivery
      } else {
        if (!config.SPAWN_STORE_EXACT_COORDINATES) {
          event.coordinates = undefined;
        }
      }

      if (!config.SPAWN_SHOW_NEAREST_PLAYER) {
        event.nearestPlayer = undefined;
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

      if (alertChannelId && config.DISCORD_TOKEN) {
        await queues.spawnDelivery.add(JOB_NAMES.DELIVER_DISCORD_SPAWN_ALERT, {
          spawnEventId: spawnEvent?.id ?? eventId,
          channelId: alertChannelId,
          roleIds: alertRoleIds,
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

  const deliveryWorker = new Worker<DeliverDiscordSpawnAlertPayload>(
    QUEUE_NAMES.SPAWN_DELIVERY,
    async (job: Job<DeliverDiscordSpawnAlertPayload>) => {
      const {
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

      const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

      const embed = buildSpawnAlertEmbed(
        {
          source: "csa",
          serverId: config.BIGMONCRAFT_SERVER_ID,
          receivedAt: new Date().toISOString(),
          displayName: "Pokémon detectado",
          level: 50,
          biome: "Savanna",
          bucket: "ULTRA_RARE",
        },
        { coordinatePolicy, regionGridSize, showNearestPlayer, serverAddress },
      );

      if (!embed) return;

      const allowedMentions = {
        parse: [] as never[],
        roles: roleIds.filter(Boolean),
      };

      try {
        await rest.post(Routes.channelMessages(channelId), {
          body: {
            embeds: [embed],
            allowed_mentions: allowedMentions,
          },
        });
        metrics.spawnAlertDeliveredTotal
          .labels(
            embed.title.includes("shiny") ? "shiny" : "standard",
            config.BIGMONCRAFT_SERVER_ID,
          )
          .inc();
        logger.info({ channelId }, "Alerta de spawn entregue no Discord.");
      } catch (error) {
        metrics.spawnAlertFailedTotal.labels("discord-error", "delivery").inc();
        logger.error({ err: error, channelId }, "Falha ao entregar alerta no Discord.");
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

import "dotenv/config";

import { parseEnv } from "@bigbangcraft/config";
import { createLogger, createMetrics, ShutdownManager } from "@bigbangcraft/observability";
import { createDatabaseClient, testDatabaseConnection } from "@bigbangcraft/database";
import { createRedisClient, createQueues } from "@bigbangcraft/queue";
import {
  PokeApiClient,
  CachedPokemonProvider,
  InMemoryTtlCache,
  RedisKeyValueStore,
  type KeyValueStore,
} from "@bigbangcraft/pokemon-data";
import { AutocompleteRanker, loadAutocompleteIndex } from "@bigbangcraft/pokemon-data";
import { SnapshotStore } from "@bigbangcraft/cobblemon-data";
import { SpawnDedupService } from "@bigbangcraft/csa-integration";
import { ALL_SLASH_COMMANDS } from "@bigbangcraft/discord-ui";
import { createServer } from "./api/server.js";
import { stat } from "node:fs/promises";
import {
  createDiscordClient,
  destroyDiscordClient,
  attachInteractionHandler,
} from "./discord/client.js";
import { createInteractionHandler } from "./discord/interactions.js";
import type { DedupStore } from "@bigbangcraft/csa-integration";

async function main(): Promise<void> {
  const config = parseEnv();
  const logger = createLogger({
    serviceName: "bot-api",
    environment: config.NODE_ENV,
    version: config.APP_VERSION,
    level: config.LOG_LEVEL,
  });
  logger.info({ env: config.NODE_ENV }, "Iniciando Professor Carvalho (bot-api)...");

  const metrics = createMetrics({
    includeDefaultMetrics: config.METRICS_INCLUDE_DEFAULT_METRICS && config.METRICS_ENABLED,
  });

  const { db, pool } = createDatabaseClient({
    connectionString: config.DATABASE_URL,
    poolMax: config.DATABASE_POOL_MAX,
    connectionTimeoutMs: config.DATABASE_CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: config.DATABASE_STATEMENT_TIMEOUT_MS,
  });

  const redisClient = createRedisClient({
    redisUrl: config.REDIS_URL,
    redisPassword: config.REDIS_PASSWORD ?? "",
    keyPrefix: config.REDIS_KEY_PREFIX,
  });

  const queues = createQueues(redisClient, config.REDIS_KEY_PREFIX);

  const snapshotStore = new SnapshotStore();
  if (config.COBBLEMON_SNAPSHOT_PATH) {
    try {
      const snapshotPath = config.COBBLEMON_SNAPSHOT_PATH;
      const fileExists = await checkFileExists(snapshotPath);
      if (fileExists) {
        await snapshotStore.loadFromFile(snapshotPath);
        metrics.cobblemonSnapshotLoaded.set(1);
        const age = snapshotStore.ageSeconds;
        if (age !== null) metrics.cobblemonSnapshotAgeSeconds.set(age);
        logger.info(
          { entries: snapshotStore.current?.entryCount ?? 0 },
          "Snapshot de spawns carregado.",
        );
      } else if (config.COBBLEMON_SNAPSHOT_REQUIRED) {
        logger.error("Snapshot de spawns obrigatório não encontrado. Encerrando.");
        process.exit(1);
      }
    } catch (error) {
      logger.error({ err: error }, "Falha ao carregar snapshot de spawns.");
      if (config.COBBLEMON_SNAPSHOT_REQUIRED) {
        process.exit(1);
      }
    }
  }

  const cacheStore: KeyValueStore = new RedisKeyValueStore(
    redisClient,
    config.REDIS_KEY_PREFIX,
  );
  const memoryCache = new InMemoryTtlCache(512);
  const rawClient = new PokeApiClient({
    baseUrl: config.POKEAPI_BASE_URL,
    timeoutMs: config.POKEAPI_REQUEST_TIMEOUT_MS,
    userAgent: config.POKEAPI_USER_AGENT,
  });
  const provider = new CachedPokemonProvider(rawClient, {
    store: cacheStore,
    freshTtlSeconds: config.POKEMON_CACHE_TTL_SECONDS,
    staleTtlSeconds: config.POKEMON_CACHE_STALE_TTL_SECONDS,
    negativeTtlSeconds: config.POKEMON_NEGATIVE_CACHE_TTL_SECONDS,
    memoryCache,
    metrics: {
      hit: (cache) => {
        if (cache === "memory") {
          metrics.pokemonCacheHitTotal.labels("memory").inc();
        } else if (cache === "redis") {
          metrics.pokemonCacheHitTotal.labels("redis").inc();
        } else if (cache === "stale") {
          metrics.pokemonCacheHitTotal.labels("stale").inc();
        }
      },
      miss: () => {
        metrics.pokemonCacheMissTotal.labels("any").inc();
      },
    },
  });

  let ranker: AutocompleteRanker;
  try {
    const indexPath = process.env.AUTOCOMPLETE_INDEX_PATH ?? "./data/generated/pokemon-index.json";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic JSON import cannot be typed at compile time
    const { default: indexData } = await import(indexPath, { with: { type: "json" } });
    const index = loadAutocompleteIndex(indexData);
    ranker = new AutocompleteRanker(index);
    logger.info({ entries: ranker.entryCount }, "Índice de autocomplete carregado.");
  } catch {
    logger.error(
      "Índice de autocomplete não encontrado. Execute pnpm data:generate-pokemon-index.",
    );
    process.exit(1);
  }

  const dedupStore: DedupStore = {
    async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
      const result = await redisClient.set(key, value, "EX", ttlSeconds, "NX");
      return result === "OK";
    },
  };
  const dedupService = new SpawnDedupService({
    store: dedupStore,
    windowSeconds: config.CSA_DEDUP_WINDOW_SECONDS,
    keyPrefix: config.REDIS_KEY_PREFIX,
  });

  const { app, shutdown: shutdownServer } = await createServer({
    config,
    logger,
    metrics,
    db,
    queues,
    dedupService,
    ranker,
  });

  const discordClient = createDiscordClient(logger);
  attachInteractionHandler(
    discordClient,
    createInteractionHandler({
      logger,
      provider,
      ranker,
      snapshotIsLoaded: snapshotStore.isLoaded,
      currentSnapshot: snapshotStore.current,
      snapshotAgeSeconds: snapshotStore.ageSeconds,
      appVersion: config.APP_VERSION,
      serverAddress: config.BIGMONCRAFT_SERVER_ADDRESS,
      siteUrl: config.BIGMONCRAFT_SITE_URL,
      databaseReachable: await testDatabaseConnection(db),
      redisReachable: true,
      workerHeartbeatAgeSeconds: 15,
      pokemonCacheEntries: memoryCache.size,
      csaMode: config.CSA_INTEGRATION_MODE,
      queueSummary: [],
    }),
  );

  const shutdownManager = new ShutdownManager(logger, config.SHUTDOWN_TIMEOUT_MS);
  shutdownManager.register("discord", () => destroyDiscordClient(discordClient));
  shutdownManager.register("server", () => shutdownServer());
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

  await app.listen({ host: config.HOST, port: config.PORT });
  logger.info({ port: config.PORT }, "API HTTP iniciada.");

  if (!config.DISCORD_TOKEN || !config.DISCORD_CLIENT_ID) {
    logger.warn(
      "DISCORD_TOKEN ou DISCORD_CLIENT_ID não configurados. Bot Discord não será conectado.",
    );
    return;
  }

  await discordClient.login(config.DISCORD_TOKEN);
  metrics.discordReady.set(1);

  if (config.DISCORD_COMMAND_REGISTRATION_MODE === "guild" && config.DISCORD_DEV_GUILD_ID) {
    const guild = await discordClient.guilds.fetch(config.DISCORD_DEV_GUILD_ID);
    await guild.commands.set(ALL_SLASH_COMMANDS);
    logger.info({ guild: config.DISCORD_DEV_GUILD_ID }, "Comandos registrados na guild.");
  } else if (config.DISCORD_COMMAND_REGISTRATION_MODE === "global") {
    await discordClient.application?.commands.set(ALL_SLASH_COMMANDS);
    logger.info("Comandos registrados globalmente.");
  }

  logger.info("Professor Carvalho (bot-api) pronto.");
}

async function checkFileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error("Falha fatal ao iniciar:", error);
  process.exit(1);
});

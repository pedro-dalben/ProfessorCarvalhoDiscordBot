import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { schema } from "@bigbangcraft/database";
import { createServer } from "../src/api/server.js";
import { createLogger, createMetrics } from "@bigbangcraft/observability";
import { createRedisClient, createQueues } from "@bigbangcraft/queue";
import { SpawnDedupService } from "@bigbangcraft/csa-integration";
import { createCsaFixture } from "@bigbangcraft/testing";
import { processCsaJob, deliverDiscordJob } from "../../worker/src/handlers.js";
import type { DiscordSender } from "../../worker/src/handlers.js";
import { parseEnv } from "@bigbangcraft/config";
import type { AppConfig } from "@bigbangcraft/config";
import {
  ensureIntegrationSource,
  findSpawnEventByIntegrationEventId,
} from "@bigbangcraft/database";
import { sha256Hex } from "@bigbangcraft/domain";

const TOKEN = "e2e-test-token-with-more-than-32-characters-0001";

interface EnvOverrides {
  CSA_INTEGRATION_MODE: "relay";
  CSA_SOURCE_TOKEN: string;
  CSA_ALLOWED_CIDRS: string;
  CSA_EXPECTED_SOURCE_VERSION: string;
  CSA_DEDUP_FAIL_OPEN: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  REDIS_KEY_PREFIX: string;
  BIGMONCRAFT_SERVER_ID: string;
  BIGMONCRAFT_SERVER_NAME: string;
  BIGMONCRAFT_SERVER_ADDRESS: string;
  SPAWN_COORDINATE_POLICY: string;
  SPAWN_SHOW_NEAREST_PLAYER: string;
  DISCORD_SPAWN_ALERT_CHANNEL_ID: string;
  DISCORD_SHINY_ALERT_ROLE_ID: string;
  DISCORD_LEGENDARY_ALERT_ROLE_ID: string;
  DISCORD_COMMAND_REGISTRATION_MODE: string;
  DISCORD_DEV_GUILD_ID: string;
  NODE_ENV: string;
}

describe("e2e CSA 1.13.2 (PostgreSQL + Redis reais via Testcontainers)", () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let config: AppConfig;
  let sentBodies: Array<{ channelId: string; body: unknown }> = [];
  const sender: DiscordSender = {
    send(channelId, body) {
      sentBodies.push({ channelId, body });
      return Promise.resolve({ id: `discord-${sentBodies.length}` });
    },
  };

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine").start();
    redis = await new RedisContainer("redis:7-alpine").start();

    const connectionString = postgres.getConnectionUri();
    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });

    const env: EnvOverrides = {
      CSA_INTEGRATION_MODE: "relay",
      CSA_SOURCE_TOKEN: TOKEN,
      CSA_ALLOWED_CIDRS: "127.0.0.1/32,::1/128",
      CSA_EXPECTED_SOURCE_VERSION: "1.13.2",
      CSA_DEDUP_FAIL_OPEN: "true",
      DATABASE_URL: connectionString,
      REDIS_URL: redis.getConnectionUrl(),
      REDIS_KEY_PREFIX: "e2e:",
      BIGMONCRAFT_SERVER_ID: "bigmoncraft-e2e",
      BIGMONCRAFT_SERVER_NAME: "BigMonCraft E2E",
      BIGMONCRAFT_SERVER_ADDRESS: "bigmoncraft.bigbangcraft.com.br",
      SPAWN_COORDINATE_POLICY: "hidden",
      SPAWN_SHOW_NEAREST_PLAYER: "false",
      DISCORD_SPAWN_ALERT_CHANNEL_ID: "123456789012345678",
      DISCORD_SHINY_ALERT_ROLE_ID: "223456789012345678",
      DISCORD_LEGENDARY_ALERT_ROLE_ID: "323456789012345678",
      DISCORD_COMMAND_REGISTRATION_MODE: "guild",
      DISCORD_DEV_GUILD_ID: "423456789012345678",
      NODE_ENV: "test",
    };
    config = parseEnv(env as unknown as Record<string, string | undefined>);
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (postgres) await postgres.stop();
    if (redis) await redis.stop();
  });

  async function buildApi() {
    const logger = createLogger({
      serviceName: "e2e",
      environment: "test",
      version: "0.1.0",
      level: "error",
    });
    const metrics = createMetrics({ includeDefaultMetrics: false });
    const redisClient = createRedisClient({
      redisUrl: config.REDIS_URL,
      redisPassword: "",
      keyPrefix: config.REDIS_KEY_PREFIX,
    });
    const queues = createQueues(redisClient, config.REDIS_KEY_PREFIX);
    const dedupService = new SpawnDedupService({
      store: {
        async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
          const result = await redisClient.set(key, value, "EX", ttlSeconds, "NX");
          return result === "OK";
        },
      },
      windowSeconds: config.CSA_DEDUP_WINDOW_SECONDS,
      keyPrefix: config.REDIS_KEY_PREFIX,
    });
    const { app, shutdown } = await createServer({
      config,
      logger,
      metrics,
      db,
      queues,
      dedupService,
      ranker: {} as never,
    });
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    return {
      url: address,
      close: async () => {
        await shutdown();
        await queues.spawnAlerts.close();
        await queues.spawnDelivery.close();
        await queues.maintenance.close();
        await queues.usageAggregation.close();
        await redisClient.quit();
      },
    };
  }

  async function postFixture(apiUrl: string, payload: unknown): Promise<Response> {
    return fetch(`${apiUrl}/v1/integrations/csa/${TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  it("fluxo completo: fixture -> ingress -> parse -> dedup -> banco -> worker -> Discord", async () => {
    const api = await buildApi();
    sentBodies = [];

    await ensureIntegrationSource(db, {
      sourceKey: config.BIGMONCRAFT_SERVER_ID,
      displayName: config.BIGMONCRAFT_SERVER_NAME,
      serverId: config.BIGMONCRAFT_SERVER_ID,
      integrationType: "csa",
      expectedVersion: "1.13.2",
      tokenHash: sha256Hex(TOKEN),
    });

    const fixture = createCsaFixture({
      dex: 130,
      level: 55,
      name: "Gyarados",
      biome: "Savanna Plateau",
      bucket: "Ultra Rare",
      shiny: true,
      legendary: false,
      player: "TreinadorTeste",
      timestamp: Date.now(),
    });

    const response = await postFixture(api.url, fixture);
    expect([200, 204]).toContain(response.status);

    // 1) integration_event persistido
    const integrationEvents = await db.select().from(schema.integrationEvents);
    expect(integrationEvents.length).toBe(1);
    const integrationEvent = integrationEvents[0]!;
    expect(integrationEvent.status).toBe("received");

    // 2) worker processa (mock da fila -> chamada direta)
    const result = await processCsaJob(
      db,
      config,
      {
        eventId: integrationEvent.id,
        sourceId: integrationEvent.sourceId,
        sourceVersion: "1.13.2",
        serverId: config.BIGMONCRAFT_SERVER_ID,
      },
      async (deliveryJob) => {
        await deliverDiscordJob(
          db,
          sender,
          createMetrics({ includeDefaultMetrics: false }),
          config,
          {
            spawnEventId: deliveryJob.spawnEventId,
            channelId: deliveryJob.channelId,
            roleIds: deliveryJob.roleIds,
            coordinatePolicy: deliveryJob.coordinatePolicy,
            regionGridSize: deliveryJob.regionGridSize,
            serverAddress: deliveryJob.serverAddress,
          },
        );
      },
    );

    expect(result.spawnEventId).not.toBeNull();

    // 3) spawn_event persistido com dados reais
    const spawnRow = await findSpawnEventByIntegrationEventId(db, integrationEvent.id);
    expect(spawnRow).not.toBeNull();
    expect(spawnRow!.species).toBe("Gyarados");
    expect(spawnRow!.dexNumber).toBe(130);
    expect(spawnRow!.level).toBe(55);
    expect(spawnRow!.shiny).toBe(true);
    expect(spawnRow!.legendary).toBe(false);
    expect(spawnRow!.biome).toBe("Savanna Plateau");
    expect(spawnRow!.coordinateRegion).toBeNull();

    // 4) payload Discord usa dados reais e sem coordenadas
    expect(sentBodies.length).toBe(1);
    const body = sentBodies[0]!.body as {
      embeds: Array<{ description: string }>;
      allowed_mentions: { parse: never[]; roles?: string[] };
    };
    const description = body.embeds[0]!.description;
    expect(description).toContain("Gyarados");
    expect(description).toContain("55");
    expect(description).toContain("Savanna Plateau");
    expect(description).not.toContain("1234");
    expect(description).not.toContain("-567");
    expect(description).not.toContain("TreinadorTeste");

    // 5) placeholders de demonstração NUNCA aparecem
    expect(description).not.toContain("Pokémon detectado");
    expect(description).not.toContain("level 50");

    // 6) menções seguras: apenas role shiny
    expect(body.allowed_mentions.parse).toEqual([]);
    expect(body.allowed_mentions.roles).toEqual([config.DISCORD_SHINY_ALERT_ROLE_ID]);

    // 7) delivery idempotente: segunda execução não re-envia
    await deliverDiscordJob(db, sender, createMetrics({ includeDefaultMetrics: false }), config, {
      spawnEventId: result.spawnEventId!,
      channelId: config.DISCORD_SPAWN_ALERT_CHANNEL_ID!,
      roleIds: [],
      coordinatePolicy: "hidden",
      regionGridSize: 500,
      serverAddress: config.BIGMONCRAFT_SERVER_ADDRESS,
    });
    expect(sentBodies.length).toBe(1);

    await api.close();
  });

  it("entrada duplicada gera apenas uma entrega", async () => {
    const api = await buildApi();
    sentBodies = [];

    const before = (await db.select().from(schema.integrationEvents)).length;

    const fixture = createCsaFixture({
      dex: 25,
      level: 50,
      name: "Pikachu",
      timestamp: Date.now(),
    });

    const first = await postFixture(api.url, fixture);
    expect([200, 204]).toContain(first.status);
    const second = await postFixture(api.url, fixture);
    expect([200, 204]).toContain(second.status);

    const after = (await db.select().from(schema.integrationEvents)).length;
    expect(after - before).toBe(1);

    const pikachuEvents = await db
      .select({ id: schema.integrationEvents.id, sourceId: schema.integrationEvents.sourceId })
      .from(schema.integrationEvents)
      .where(sql`${schema.integrationEvents.normalizedPayload}->>'displayName' = 'Pikachu'`);
    expect(pikachuEvents.length).toBe(1);
    const pikachuEvent = pikachuEvents[0]!;

    const delivery = await processCsaJob(
      db,
      config,
      {
        eventId: pikachuEvent.id,
        sourceId: pikachuEvent.sourceId,
        sourceVersion: "1.13.2",
        serverId: config.BIGMONCRAFT_SERVER_ID,
      },
      async (deliveryJob) => {
        await deliverDiscordJob(
          db,
          sender,
          createMetrics({ includeDefaultMetrics: false }),
          config,
          {
            spawnEventId: deliveryJob.spawnEventId,
            channelId: deliveryJob.channelId,
            roleIds: deliveryJob.roleIds,
            coordinatePolicy: deliveryJob.coordinatePolicy,
            regionGridSize: deliveryJob.regionGridSize,
            serverAddress: deliveryJob.serverAddress,
          },
        );
      },
    );
    expect(delivery.spawnEventId).not.toBeNull();
    expect(sentBodies.length).toBe(1);

    await api.close();
  });

  it("token inválido -> 401; payload malformado -> 400", async () => {
    const api = await buildApi();
    const fixture = createCsaFixture({ timestamp: Date.now() });

    const badToken = await fetch(
      `${api.url}/v1/integrations/csa/wrong-token-0000000000000000000000`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fixture),
      },
    );
    expect(badToken.status).toBe(401);

    const malformed = await fetch(`${api.url}/v1/integrations/csa/${TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ not_a_payload: true }),
    });
    expect(malformed.status).toBe(400);

    const missingMarker = await fetch(`${api.url}/v1/integrations/csa/${TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "A wild pokemon appeared" }),
    });
    expect(missingMarker.status).toBe(400);

    await api.close();
  });

  it("X-Forwarded-For forjado não burla o allowlist de CIDR", async () => {
    const api = await buildApi();
    const fixture = createCsaFixture({ timestamp: Date.now() });

    // Com trustProxy restrito ao loopback, um XFF forjado não altera request.ip:
    // o par TCP (127.0.0.1) é usado e o CIDR é validado contra ele.
    // Se trustProxy aceitasse XFF arbitrariamente, o IP 10.0.0.1 seria usado e
    // a requisição seria rejeitada com 403 (CIDR não permitido) — ou seja, o
    // XFF jamais pode "liberar" um IP; no máximo pode ser ignorado.
    const response = await fetch(`${api.url}/v1/integrations/csa/${TOKEN}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "10.0.0.1",
      },
      body: JSON.stringify(fixture),
    });
    expect(response.status).toBe(204);
    expect(response.status).not.toBe(403);

    await api.close();
  });
});

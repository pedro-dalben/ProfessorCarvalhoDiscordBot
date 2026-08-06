import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createServer } from "../src/api/server.js";
import { createLogger, createMetrics } from "@bigbangcraft/observability";
import { createRedisClient, createQueues } from "@bigbangcraft/queue";
import { parseEnv, type AppConfig } from "@bigbangcraft/config";
import {
  schema,
  createIdentityLinkCode,
  findActiveIdentity,
  getLatestProfileSnapshot,
  findGatewayServer,
  unlinkIdentity,
} from "@bigbangcraft/database";
import { hashLinkCode } from "../src/identity/crypto.js";
import { createHash, createHmac } from "node:crypto";

describe("BigBang ID e gateway v1", () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let config: AppConfig;
  let api: Awaited<ReturnType<typeof startApi>>;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine").start();
    redis = await new RedisContainer("redis:7-alpine").start();
    pool = new Pool({ connectionString: postgres.getConnectionUri() });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    config = parseEnv({
      NODE_ENV: "test",
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: redis.getConnectionUrl(),
      REDIS_KEY_PREFIX: "identity-e2e:",
      GATEWAY_INGRESS_ENABLED: "true",
      GATEWAY_SHARED_SECRET: "test-only-gateway-secret-0123456789012345",
      GATEWAY_ALLOWED_CIDRS: "127.0.0.1/32",
      IDENTITY_LINKING_ENABLED: "true",
      IDENTITY_LINK_CODE_PEPPER: "test-only-link-pepper-0123456789012345",
      DISCORD_COMMAND_REGISTRATION_MODE: "global",
      BIGMONCRAFT_SERVER_ID: "bigmoncraft-e2e",
      BIGMONCRAFT_SERVER_NAME: "BigMonCraft E2E",
    });
    api = await startApi(db, config);
  });

  afterAll(async () => {
    if (api) await api.close();
    if (pool) await pool.end();
    if (postgres) await postgres.stop();
    if (redis) await redis.stop();
  });

  it("consome código atomicamente, aceita perfil e rejeita replay", async () => {
    const code = "CARVALHO-7K4P2MXQ";
    await createIdentityLinkCode(db, {
      codeHash: hashLinkCode(code, config.IDENTITY_LINK_CODE_PEPPER!),
      discordUserId: "123456789012345678",
      guildId: "223456789012345678",
      expiresAt: new Date(Date.now() + 600_000),
      maximumAttempts: 5,
      serverId: config.BIGMONCRAFT_SERVER_ID,
    });
    const linkBody = JSON.stringify({
      code,
      minecraftUuid: "123e4567-e89b-12d3-a456-426614174000",
      minecraftName: "José",
      serverId: config.BIGMONCRAFT_SERVER_ID,
      requestedAt: new Date().toISOString(),
    });
    const linkRequestId = "123e4567-e89b-42d3-a456-426614174001";
    const first = await signedPost(
      api.url,
      "/v1/gateway/identity/link",
      linkBody,
      config,
      linkRequestId,
    );
    expect(first.status).toBe(200);
    expect(((await first.json()) as { code: string }).code).toBe("IDENTITY_LINKED");
    const replay = await signedPost(
      api.url,
      "/v1/gateway/identity/link",
      linkBody,
      config,
      linkRequestId,
    );
    expect(replay.status).toBe(409);
    expect(
      (
        await findActiveIdentity(db, {
          minecraftUuid: "123e4567-e89b-12d3-a456-426614174000",
          serverId: config.BIGMONCRAFT_SERVER_ID,
        })
      )?.discordUserId,
    ).toBe("123456789012345678");

    const eventId = "123e4567-e89b-42d3-a456-426614174002";
    const profileBody = JSON.stringify({
      eventId,
      eventType: "player.profile.snapshot",
      schemaVersion: "1",
      serverId: config.BIGMONCRAFT_SERVER_ID,
      occurredAt: new Date().toISOString(),
      payload: {
        player: {
          minecraftUuid: "123e4567-e89b-12d3-a456-426614174000",
          minecraftName: "José",
          online: true,
          ip: "192.0.2.1",
        },
        progression: {
          jobs: [{ id: "trainer", displayName: "Treinador", level: 18, experience: 14500 }],
        },
        economy: { coins: { available: true, amount: "52430.00", formatted: "52.430 moedas" } },
        cobblemon: {
          available: true,
          party: [
            { species: "garchomp", form: null, displayName: "Garchomp", level: 82, shiny: false },
          ],
          pokedex: { available: true, caught: 420, total: 1025 },
        },
        secretField: "remove",
      },
    });
    const profile = await signedPost(
      api.url,
      "/v1/gateway/profiles",
      profileBody,
      config,
      "123e4567-e89b-42d3-a456-426614174003",
    );
    expect(profile.status).toBe(200);
    expect(((await profile.json()) as { accepted: boolean }).accepted).toBe(true);
    const snapshot = await getLatestProfileSnapshot(
      db,
      (await findActiveIdentity(db, {
        minecraftUuid: "123e4567-e89b-12d3-a456-426614174000",
        serverId: config.BIGMONCRAFT_SERVER_ID,
      }))!.id,
      config.BIGMONCRAFT_SERVER_ID,
    );
    expect(snapshot).not.toBeNull();
    expect(JSON.stringify(snapshot!.snapshot)).not.toContain("secretField");
    expect(JSON.stringify(snapshot!.snapshot)).not.toContain("192.0.2.1");

    const duplicate = await signedPost(
      api.url,
      "/v1/gateway/profiles",
      profileBody,
      config,
      "123e4567-e89b-42d3-a456-426614174004",
    );
    expect(((await duplicate.json()) as { duplicate: boolean }).duplicate).toBe(true);
    const conflictBody = profileBody.replace('"secretField":"remove"', '"secretField":"altered"');
    const conflict = await signedPost(
      api.url,
      "/v1/gateway/profiles",
      conflictBody,
      config,
      "123e4567-e89b-42d3-a456-426614174005",
    );
    expect(conflict.status).toBe(409);

    const heartbeat = await signedPost(
      api.url,
      "/v1/gateway/heartbeat",
      JSON.stringify({
        gatewayVersion: "0.1.0",
        protocolVersion: "1",
        onlinePlayers: 1,
        linkedPlayersOnline: 1,
        modules: { bigBangEssentials: true, cobblemon: true },
      }),
      config,
      "123e4567-e89b-42d3-a456-426614174006",
    );
    expect(((await heartbeat.json()) as { accepted: boolean }).accepted).toBe(true);
    expect((await findGatewayServer(db, config.BIGMONCRAFT_SERVER_ID))?.gatewayVersion).toBe(
      "0.1.0",
    );

    await unlinkIdentity(db, {
      discordUserId: "123456789012345678",
      serverId: config.BIGMONCRAFT_SERVER_ID,
      actorId: "123456789012345678",
    });
    const afterUnlinkBody = profileBody.replace(eventId, "123e4567-e89b-42d3-a456-426614174007");
    const afterUnlink = await signedPost(
      api.url,
      "/v1/gateway/profiles",
      afterUnlinkBody,
      config,
      "123e4567-e89b-42d3-a456-426614174008",
    );
    expect(((await afterUnlink.json()) as { code: string }).code).toBe("IDENTITY_NOT_LINKED");
  });
});

async function startApi(db: ReturnType<typeof drizzle<typeof schema>>, config: AppConfig) {
  const redisClient = createRedisClient({
    redisUrl: config.REDIS_URL,
    redisPassword: "",
    keyPrefix: config.REDIS_KEY_PREFIX,
  });
  const queues = createQueues(redisClient, config.REDIS_KEY_PREFIX);
  const dedupService = {
    store: {
      setNx: async (key: string, value: string, ttl: number) =>
        (await redisClient.set(key, value, "EX", ttl, "NX")) === "OK",
    },
    windowSeconds: 90,
    keyPrefix: config.REDIS_KEY_PREFIX,
    onRedisFailure: "fail-open",
  } as never;
  const server = await createServer({
    config,
    logger: createLogger({
      serviceName: "identity-e2e",
      environment: "test",
      version: "0.1.0",
      level: "error",
    }),
    metrics: createMetrics({ includeDefaultMetrics: false }),
    db,
    queues,
    dedupService,
    ranker: {} as never,
    redisClient,
  });
  const url = await server.app.listen({ port: 0, host: "127.0.0.1" });
  return {
    url,
    close: async () => {
      await server.shutdown();
      await queues.spawnAlerts.close();
      await queues.spawnDelivery.close();
      await queues.maintenance.close();
      await queues.usageAggregation.close();
      await redisClient.quit();
    },
  };
}

async function signedPost(
  baseUrl: string,
  path: string,
  body: string,
  config: AppConfig,
  requestId: string,
): Promise<Response> {
  const timestamp = String(Date.now());
  const bodyHash = createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex");
  const canonical = [
    "POST",
    path,
    config.BIGMONCRAFT_SERVER_ID,
    timestamp,
    requestId,
    config.GATEWAY_PROTOCOL_VERSION,
    bodyHash,
  ].join("\n");
  const signature = createHmac("sha256", config.GATEWAY_SHARED_SECRET!)
    .update(canonical, "utf8")
    .digest("hex");
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Professor-Server": config.BIGMONCRAFT_SERVER_ID,
      "X-Professor-Timestamp": timestamp,
      "X-Professor-Request-Id": requestId,
      "X-Professor-Gateway-Version": config.GATEWAY_PROTOCOL_VERSION,
      "X-Professor-Signature": signature,
    },
    body,
  });
}

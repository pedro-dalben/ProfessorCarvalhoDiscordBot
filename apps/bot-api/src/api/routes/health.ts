import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@bigbangcraft/database";
import { testDatabaseConnection } from "@bigbangcraft/database";
import type { QueueSet } from "@bigbangcraft/queue";
import type { AppConfig } from "@bigbangcraft/config";

export function registerHealthRoutes(
  app: FastifyInstance,
  deps: { db: DatabaseClient; queues: QueueSet; config: AppConfig },
): void {
  app.get("/health/live", async (_request, reply) => {
    return reply.status(200).send({ status: "ok" });
  });

  app.get("/health/ready", async (_request, reply) => {
    const checks: Record<string, string> = {};

    const dbOk = await testDatabaseConnection(deps.db);
    checks.database = dbOk ? "ok" : "unavailable";

    const redisOk = await checkRedis(deps.queues);
    checks.redis = redisOk ? "ok" : "unavailable";

    const allOk = Object.values(checks).every((status) => status === "ok");
    const status = allOk ? 200 : 503;
    return reply.status(status).send({ status: allOk ? "ready" : "not-ready", checks });
  });

  app.get("/health", async (_request, reply) => {
    return reply.redirect("/health/live");
  });
}

async function checkRedis(queues: QueueSet): Promise<boolean> {
  try {
    const client = queues.spawnAlerts;
    const workers = await client.getWorkers();
    return Array.isArray(workers);
  } catch {
    return false;
  }
}

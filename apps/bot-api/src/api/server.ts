import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { fastifyHelmet } from "@fastify/helmet";
import { fastifyRateLimit } from "@fastify/rate-limit";
import type { AppLogger, ProfessorMetrics } from "@bigbangcraft/observability";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { registerCsaRoutes } from "./routes/csa.js";
import { registerGatewayRoutes } from "./routes/gateway.js";
import type { SpawnDedupService } from "@bigbangcraft/csa-integration";
import type { DatabaseClient } from "@bigbangcraft/database";
import type { QueueSet } from "@bigbangcraft/queue";
import type { AppConfig } from "@bigbangcraft/config";
import type { AutocompleteRanker } from "@bigbangcraft/pokemon-data";
import type { Redis } from "ioredis";

export interface ServerDependencies {
  config: AppConfig;
  logger: AppLogger;
  metrics: ProfessorMetrics;
  db: DatabaseClient;
  queues: QueueSet;
  dedupService: SpawnDedupService;
  ranker: AutocompleteRanker;
  redisClient: Redis;
}

export async function createServer(
  deps: ServerDependencies,
): Promise<{ app: FastifyInstance; shutdown: () => Promise<void> }> {
  const { config, logger, metrics, db, queues, dedupService, redisClient } = deps;

  const app = Fastify({
    logger: false,
    trustProxy: config.TRUSTED_PROXY_ADDRESSES ?? false,
    bodyLimit: Math.max(config.CSA_BODY_LIMIT_BYTES, config.GATEWAY_BODY_LIMIT_BYTES),
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
  });

  await app.register(fastifyRateLimit, {
    max: config.HTTP_RATE_LIMIT_MAX,
    timeWindow: config.HTTP_RATE_LIMIT_WINDOW_SECONDS * 1000,
    keyGenerator: (request) => {
      return request.ip;
    },
  });

  registerHealthRoutes(app, { db, queues, config });
  registerMetricsRoutes(app, { metrics, config });
  registerCsaRoutes(app, { config, logger, db, queues, dedupService, metrics });
  registerGatewayRoutes(app, { config, logger, db, redis: redisClient });

  app.setErrorHandler((error, _request, reply) => {
    logger.error({ err: error }, "Erro não tratado em rota HTTP.");
    reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor.",
      },
    });
  });

  const shutdown = async (): Promise<void> => {
    await app.close();
  };

  return { app, shutdown };
}

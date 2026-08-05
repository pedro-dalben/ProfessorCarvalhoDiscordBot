import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { fastifyHelmet } from "@fastify/helmet";
import { fastifyRateLimit } from "@fastify/rate-limit";
import type { AppLogger, ProfessorMetrics } from "@bigbangcraft/observability";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { registerCsaRoutes } from "./routes/csa.js";
import type { SpawnDedupService } from "@bigbangcraft/csa-integration";
import type { DatabaseClient } from "@bigbangcraft/database";
import type { QueueSet } from "@bigbangcraft/queue";
import type { AppConfig } from "@bigbangcraft/config";
import type { AutocompleteRanker } from "@bigbangcraft/pokemon-data";

export interface ServerDependencies {
  config: AppConfig;
  logger: AppLogger;
  metrics: ProfessorMetrics;
  db: DatabaseClient;
  queues: QueueSet;
  dedupService: SpawnDedupService;
  ranker: AutocompleteRanker;
}

export async function createServer(
  deps: ServerDependencies,
): Promise<{ app: FastifyInstance; shutdown: () => Promise<void> }> {
  const { config, logger, metrics, db, queues, dedupService } = deps;

  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: config.CSA_BODY_LIMIT_BYTES,
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
  registerCsaRoutes(app, { config, logger, db, queues, dedupService });

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

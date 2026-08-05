import type { FastifyInstance } from "fastify";
import type { ProfessorMetrics } from "@bigbangcraft/observability";
import type { AppConfig } from "@bigbangcraft/config";

export function registerMetricsRoutes(
  app: FastifyInstance,
  deps: { metrics: ProfessorMetrics; config: AppConfig },
): void {
  app.get("/metrics", async (request, reply) => {
    if (!deps.config.METRICS_ENABLED) {
      return reply.status(404).send({ error: "Métricas não habilitadas." });
    }
    if (deps.config.METRICS_BEARER_TOKEN) {
      const auth = request.headers.authorization;
      if (!auth || auth !== `Bearer ${deps.config.METRICS_BEARER_TOKEN}`) {
        return reply.status(401).send({ error: "Não autorizado." });
      }
    }
    const body = await deps.metrics.registry.metrics();
    return reply.header("Content-Type", deps.metrics.registry.contentType).send(body);
  });
}

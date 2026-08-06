/**
 * Diagnóstico da integração CSA (Modo Relay) — uso administrativo.
 *
 * Uso:
 *   pnpm integrations:csa:doctor
 *
 * Status usados: OK | AVISO | ERRO | NÃO VALIDADO
 * NUNCA exibe: token, senhas, URLs tokenizadas.
 */
import "dotenv/config";
import { parseEnv } from "@bigbangcraft/config";
import {
  createDatabaseClient,
  testDatabaseConnection,
  findSourceByKey,
} from "@bigbangcraft/database";
import { createQueues, getQueueMetrics } from "@bigbangcraft/queue";
import { Redis as RedisClient } from "ioredis";
import { stat } from "node:fs/promises";

type Status = "OK" | "AVISO" | "ERRO" | "NÃO VALIDADO";

interface CheckResult {
  name: string;
  status: Status;
  detail: string;
}

async function main(): Promise<void> {
  const results: CheckResult[] = [];

  let config: ReturnType<typeof parseEnv>;
  try {
    config = parseEnv();
    results.push({ name: "Ambiente", status: "OK", detail: "variáveis obrigatórias presentes" });
  } catch (error) {
    console.error("ERRO fatal: configuração de ambiente inválida.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const mode = config.CSA_INTEGRATION_MODE;
  results.push({
    name: "Modo CSA",
    status: mode === "relay" ? "OK" : mode === "disabled" ? "ERRO" : "AVISO",
    detail:
      mode === "relay"
        ? "relay (ingress HTTP ativo)"
        : mode === "direct"
          ? "direct (fallback Discord nativo — relay inativo)"
          : "disabled (integração desligada)",
  });

  const { db, pool } = createDatabaseClient({
    connectionString: config.DATABASE_URL,
    poolMax: 2,
    connectionTimeoutMs: config.DATABASE_CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: config.DATABASE_STATEMENT_TIMEOUT_MS,
  });

  const dbOk = await testDatabaseConnection(db);
  results.push({
    name: "PostgreSQL",
    status: dbOk ? "OK" : "ERRO",
    detail: dbOk ? "conectividade confirmada" : "sem conexão",
  });

  let source: Awaited<ReturnType<typeof findSourceByKey>>;
  if (dbOk) {
    try {
      source = await findSourceByKey(db, config.BIGMONCRAFT_SERVER_ID);
      results.push({
        name: "Fonte de integração",
        status: source ? "OK" : "ERRO",
        detail: source
          ? `id=${source.id} habilitada=${source.enabled ? "sim" : "NÃO"}`
          : `ausente (execute pnpm integrations:csa:setup)`,
      });
      if (source) {
        results.push({
          name: "Fonte habilitada",
          status: source.enabled ? "OK" : "ERRO",
          detail: source.enabled ? "requisições aceitas" : "requisições rejeitadas com 403",
        });
        results.push({
          name: "Hash do token",
          status: source.tokenHash ? "OK" : "ERRO",
          detail: source.tokenHash ? "hash sha256 armazenado" : "ausente",
        });
        results.push({
          name: "Versão esperada do CSA",
          status: source.expectedVersion ? "OK" : "AVISO",
          detail: source.expectedVersion ?? "não definida",
        });
      }
    } catch (error) {
      results.push({
        name: "Fonte de integração",
        status: "ERRO",
        detail: error instanceof Error ? error.message.slice(0, 200) : "falha de consulta",
      });
    }
  }

  // Cliente Redis com retry limitado: o diagnóstico nunca deve travar.
  const redisClient = new RedisClient(config.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    retryStrategy(times: number): number | null {
      return times > 3 ? null : Math.min(times * 200, 1000);
    },
  });

  let redisOk: boolean;
  try {
    redisOk = (await redisClient.ping()) === "PONG";
  } catch {
    redisOk = false;
  }
  results.push({
    name: "Redis",
    status: redisOk ? "OK" : "ERRO",
    detail: redisOk ? "conectividade confirmada" : "sem conexão",
  });

  if (redisOk) {
    try {
      const keys = await redisClient.keys(`${config.REDIS_KEY_PREFIX}heartbeat:worker:*`);
      let freshCount = 0;
      for (const key of keys) {
        const raw = await redisClient.get(key);
        const lastSeen = Number.parseInt(raw ?? "0", 10);
        if (lastSeen > Date.now() - 90_000) freshCount++;
      }
      results.push({
        name: "Heartbeat do worker",
        status: freshCount > 0 ? "OK" : "AVISO",
        detail: freshCount > 0 ? `${freshCount} instância(s) ativa(s)` : "sem heartbeat recente",
      });
    } catch {
      results.push({
        name: "Heartbeat do worker",
        status: "NÃO VALIDADO",
        detail: "falha na consulta",
      });
    }
  }

  if (redisOk) {
    try {
      const queues = createQueues(redisClient, config.REDIS_KEY_PREFIX);
      const metrics = await getQueueMetrics(queues);
      for (const entry of metrics) {
        results.push({
          name: `Fila ${entry.queue}`,
          status: "OK",
          detail: `aguardando=${entry.waiting} ativos=${entry.active} falhas=${entry.failed}`,
        });
      }
      await Promise.all([
        queues.spawnAlerts.close(),
        queues.spawnDelivery.close(),
        queues.maintenance.close(),
        queues.usageAggregation.close(),
      ]);
    } catch {
      results.push({ name: "Filas BullMQ", status: "NÃO VALIDADO", detail: "falha na consulta" });
    }
  }

  results.push({
    name: "Canal público de alertas",
    status: config.DISCORD_SPAWN_ALERT_CHANNEL_ID ? "OK" : "ERRO",
    detail: config.DISCORD_SPAWN_ALERT_CHANNEL_ID
      ? "DISCORD_SPAWN_ALERT_CHANNEL_ID definida"
      : "não definida — alertas não serão entregues",
  });
  results.push({
    name: "Canal privado (exact_admin_only)",
    status:
      config.SPAWN_COORDINATE_POLICY === "exact_admin_only"
        ? config.DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID
          ? "OK"
          : "ERRO"
        : "AVISO",
    detail:
      config.SPAWN_COORDINATE_POLICY === "exact_admin_only"
        ? config.DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID
          ? "definida"
          : "obrigatória nesta política"
        : "não exigida (política atual: " + config.SPAWN_COORDINATE_POLICY + ")",
  });
  results.push({
    name: "Bot no Discord",
    status: config.DISCORD_TOKEN ? "OK" : "ERRO",
    detail: config.DISCORD_TOKEN ? "token presente" : "DISCORD_TOKEN ausente",
  });

  const apiUrl = config.CSA_INTEGRATION_MODE === "relay" ? "http://127.0.0.1:3080" : null;
  results.push({
    name: "Ingress via Nginx (localhost)",
    status: apiUrl ? "NÃO VALIDADO" : "AVISO",
    detail: apiUrl
      ? "use pnpm integrations:csa:test-fixture contra http://127.0.0.1:3080"
      : "relay desativado",
  });

  if (config.COBBLEMON_SNAPSHOT_PATH) {
    try {
      const info = await stat(config.COBBLEMON_SNAPSHOT_PATH);
      results.push({
        name: "Snapshot de spawns",
        status: info.isFile() ? "OK" : "ERRO",
        detail: `arquivo presente (${info.size} bytes)`,
      });
    } catch {
      results.push({
        name: "Snapshot de spawns",
        status: config.COBBLEMON_SNAPSHOT_REQUIRED ? "ERRO" : "AVISO",
        detail: "arquivo ausente",
      });
    }
  } else {
    results.push({
      name: "Snapshot de spawns",
      status: "AVISO",
      detail: "COBBLEMON_SNAPSHOT_PATH não definida (comandos /spawn limitados)",
    });
  }

  await pool.end();
  try {
    await redisClient.quit();
  } catch {
    // encerramento best-effort
  }

  for (const result of results) {
    console.log(`[${result.status.padEnd(11)}] ${result.name}: ${result.detail}`);
  }

  const hasError = results.some((r) => r.status === "ERRO");
  console.log(hasError ? "\nResultado: existem problemas a corrigir." : "\nResultado: tudo OK.");
  process.exitCode = hasError ? 1 : 0;
}

main().catch((error) => {
  console.error("Falha no diagnóstico:", error);
  process.exit(1);
});

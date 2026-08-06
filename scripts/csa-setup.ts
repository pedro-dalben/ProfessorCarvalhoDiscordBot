/**
 * Configura a fonte de integração CSA (bigmoncraft) no PostgreSQL.
 *
 * Uso:
 *   pnpm integrations:csa:setup
 *
 * Requisitos:
 *   - DATABASE_URL definida
 *   - CSA_SOURCE_TOKEN definida (mínimo 32 caracteres)
 *   - BIGMONCRAFT_SERVER_ID / BIGMONCRAFT_SERVER_NAME opcionais
 *
 * Garantias:
 *   - idempotente (pode rodar várias vezes)
 *   - não imprime segredos
 *   - recusa tokens fracos
 *   - reporta o ID e o estado da fonte
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { parseEnv } from "@bigbangcraft/config";
import {
  createDatabaseClient,
  ensureIntegrationSource,
  findSourceByKey,
} from "@bigbangcraft/database";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isWeakToken(token: string): boolean {
  if (token.length < 32) return true;
  const unique = new Set(token).size;
  if (unique < 8) return true;
  if (/^(.)\1+$/.test(token)) return true;
  return false;
}

async function main(): Promise<void> {
  const rawToken = process.env.CSA_SOURCE_TOKEN;
  if (!rawToken) {
    console.error("ERRO: CSA_SOURCE_TOKEN não definida no ambiente.");
    console.error("Gere uma com: pnpm secrets:generate");
    process.exit(1);
  }

  if (isWeakToken(rawToken)) {
    console.error(
      "ERRO: CSA_SOURCE_TOKEN é fraca (mínimo 32 caracteres com diversidade suficiente).",
    );
    process.exit(1);
  }

  const config = parseEnv();

  const { db, pool } = createDatabaseClient({
    connectionString: config.DATABASE_URL,
    poolMax: 2,
    connectionTimeoutMs: config.DATABASE_CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: config.DATABASE_STATEMENT_TIMEOUT_MS,
  });

  try {
    const source = await ensureIntegrationSource(db, {
      sourceKey: config.BIGMONCRAFT_SERVER_ID,
      displayName: config.BIGMONCRAFT_SERVER_NAME,
      serverId: config.BIGMONCRAFT_SERVER_ID,
      integrationType: "csa",
      expectedVersion: config.CSA_EXPECTED_SOURCE_VERSION ?? "1.13.2",
      tokenHash: sha256Hex(config.CSA_SOURCE_TOKEN),
    });

    const tokenHashStored = (await findSourceByKey(db, config.BIGMONCRAFT_SERVER_ID))?.tokenHash;
    console.log("Fonte de integração CSA configurada.");
    console.log(`  sourceId:        ${source.id}`);
    console.log(`  sourceKey:       ${source.sourceKey}`);
    console.log(`  integrationType: ${source.integrationType}`);
    console.log(`  versão esperada: ${source.expectedVersion ?? "não definida"}`);
    console.log(`  habilitada:      ${source.enabled ? "sim" : "NÃO"}`);
    console.log(`  tokenHash:       ${tokenHashStored ? "armazenado (sha256)" : "AUSENTE"}`);
    if (!source.enabled) {
      console.error("AVISO: a fonte está desabilitada; requisições serão rejeitadas (403).");
      process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Falha ao configurar a fonte de integração:", error);
  process.exit(1);
});

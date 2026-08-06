/**
 * Envia um fixture sanitizado do CSA 1.13.2 para o relay.
 *
 * Uso:
 *   pnpm integrations:csa:test-fixture -- --fixture shiny
 *   pnpm integrations:csa:test-fixture -- --fixture legendary
 *   pnpm integrations:csa:test-fixture -- --fixture rare
 *   pnpm integrations:csa:test-fixture -- --fixture shiny --url http://127.0.0.1:3080
 *   pnpm integrations:csa:test-fixture -- --fixture shiny --allow-production
 *
 * Segurança:
 *   - alvo padrão: http://127.0.0.1:3080
 *   - URLs públicas de produção exigem --allow-production
 *   - o token é lido do ambiente e mascarado em qualquer saída
 *   - nenhuma coordenada/player real é usada
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseEnv } from "@bigbangcraft/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURES_DIR = join(__dirname, "..", "packages", "csa-integration", "fixtures", "1.13.2");
const PRODUCTION_HOSTS = ["bigbangcraft.com.br", "bigmoncraft.com.br", "localhost:3080"];

interface CliArgs {
  fixture: string;
  url: string;
  allowProduction: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    fixture: "rare-spawn",
    url: "http://127.0.0.1:3080",
    allowProduction: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--fixture" && argv[i + 1]) {
      args.fixture = argv[i + 1] ?? args.fixture;
      i++;
    } else if (arg === "--url" && argv[i + 1]) {
      args.url = argv[i + 1] ?? args.url;
      i++;
    } else if (arg === "--allow-production") {
      args.allowProduction = true;
    }
  }
  return args;
}

function isProductionUrl(url: string): boolean {
  return PRODUCTION_HOSTS.some((host) => url.includes(host));
}

function maskToken(url: string): string {
  return url.replace(/\/v1\/integrations\/csa\/[^/]+/, "/v1/integrations/csa/<redacted>");
}

function resolveFixtureName(fixture: string): string {
  const aliases: Record<string, string> = {
    shiny: "shiny-spawn",
    legendary: "legendary-spawn",
    rare: "rare-spawn",
    mythical: "mythical-spawn",
    "ultra-beast": "ultra-beast-spawn",
    paradox: "paradox-spawn",
  };
  return aliases[fixture] ?? fixture;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = parseEnv();

  const fixtureName = resolveFixtureName(args.fixture);
  const fixtureFile = join(FIXTURES_DIR, `${fixtureName}.json`);
  let fixture: string;
  try {
    fixture = await readFile(fixtureFile, "utf8");
  } catch {
    console.error(
      `ERRO: fixture "${args.fixture}" não encontrada em ${FIXTURES_DIR}.\n` +
        `Fixtures disponíveis: rare-spawn, shiny-spawn, legendary-spawn, mythical-spawn, ` +
        `ultra-beast-spawn, paradox-spawn, shiny-legendary-spawn, missing-optional-fields, ` +
        `unknown-placeholders, malformed-payload`,
    );
    process.exit(1);
  }

  if (isProductionUrl(args.url) && !args.allowProduction) {
    console.error(
      "ERRO: o alvo parece ser produção. Use --allow-production apenas com autorização explícita.",
    );
    process.exit(1);
  }

  if (!config.CSA_SOURCE_TOKEN) {
    console.error("ERRO: CSA_SOURCE_TOKEN não definida no ambiente.");
    process.exit(1);
  }

  const endpoint = `${args.url.replace(/\/$/, "")}/v1/integrations/csa/${config.CSA_SOURCE_TOKEN}`;
  console.log(`Enviando fixture "${args.fixture}" para ${maskToken(endpoint)}`);

  const start = Date.now();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: fixture,
    });
  } catch (error) {
    console.error(
      "ERRO: falha de conexão com o relay:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }

  const durationMs = Date.now() - start;
  console.log(`HTTP ${response.status} ${response.statusText} (${durationMs} ms)`);
  const requestId = response.headers.get("x-request-id");
  if (requestId) console.log(`Request ID: ${requestId}`);

  if (response.status === 204 || response.status === 200) {
    console.log("Fixture aceita pelo relay (status aceito pelo CSA 1.13.2).");
    return;
  }

  const body = await response.text().catch(() => "");
  console.log("Corpo da resposta:", body.slice(0, 500));
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("Falha no envio do fixture:", error);
  process.exit(1);
});

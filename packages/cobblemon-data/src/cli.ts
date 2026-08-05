import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { importSpawnSnapshot, IMPORTER_VERSION } from "./importer.js";

interface CliArgs {
  source?: string;
  output?: string;
  serverId: string;
  cobblemonVersion?: string;
  modpackVersion?: string;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { serverId: "bigmoncraft", force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--source":
        args.source = argv[++i];
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--server-id":
        args.serverId = argv[++i] ?? args.serverId;
        break;
      case "--cobblemon-version":
        args.cobblemonVersion = argv[++i];
        break;
      case "--modpack-version":
        args.modpackVersion = argv[++i];
        break;
      case "--force":
        args.force = true;
        break;
      default:
        throw new Error(`Argumento desconhecido: ${arg ?? ""}`);
    }
  }
  return args;
}

export async function runImporterCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (!args.source || args.source.trim() === "") {
    throw new Error("Informe o diretório de origem com --source.");
  }
  if (!args.output || args.output.trim() === "") {
    throw new Error("Informe o arquivo de saída com --output.");
  }

  if (!args.force) {
    try {
      const existing = await stat(args.output);
      if (existing.isFile()) {
        throw new Error(
          `O arquivo de saída já existe: ${args.output}. Use --force para sobrescrever.`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("O arquivo de saída")) throw error;
    }
  }

  const result = await importSpawnSnapshot({
    sourceDir: args.source,
    serverId: args.serverId,
    cobblemonVersion: args.cobblemonVersion,
    modpackVersion: args.modpackVersion,
  });

  const serialized = `${JSON.stringify(result.snapshot, null, 2)}\n`;
  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, serialized, "utf8");

  const sha256 = createHash("sha256").update(serialized, "utf8").digest("hex");
  // eslint-disable-next-line no-console -- CLI output is intentional
  console.log(`Snapshot gerado com sucesso.`);
  // eslint-disable-next-line no-console -- CLI output is intentional
  console.log(`  Arquivo: ${args.output}`);
  // eslint-disable-next-line no-console -- CLI output is intentional
  console.log(`  Entradas: ${result.snapshot.entryCount}`);
  // eslint-disable-next-line no-console -- CLI output is intentional
  console.log(`  Arquivos de spawn processados: ${result.fileCount}`);
  // eslint-disable-next-line no-console -- CLI output is intentional
  console.log(`  Importer: v${IMPORTER_VERSION}`);
  // eslint-disable-next-line no-console -- CLI output is intentional
  console.log(`  SHA-256: ${sha256}`);
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("cli.ts");
if (isMainModule) {
  runImporterCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`Erro na importação: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  SnapshotImportError,
  rawSpawnPoolFileSchema,
  type ImportFailure,
  type NormalizedSpawnConditions,
  type NormalizedSpawnEntry,
  type NormalizedLevelRange,
  type RawSpawn,
  type RawSpawnCondition,
  type RawSpawnPoolFile,
  type SpawnSnapshot,
} from "./schema.js";

export const IMPORTER_VERSION = "1.0.0";
export const SNAPSHOT_SCHEMA_VERSION = 1;

const SPAWN_POOL_DIR = "spawn_pool_world";

export interface ImporterOptions {
  sourceDir: string;
  serverId: string;
  cobblemonVersion?: string;
  modpackVersion?: string;
}

export interface ImportResult {
  snapshot: SpawnSnapshot;
  fileCount: number;
}

export async function importSpawnSnapshot(options: ImporterOptions): Promise<ImportResult> {
  const files = await collectSpawnPoolFiles(options.sourceDir);
  const failures: ImportFailure[] = [];
  const entries: NormalizedSpawnEntry[] = [];
  const sourcePaths: string[] = [];

  for (const file of files) {
    const relative = path.relative(options.sourceDir, file);
    try {
      const content = await readFile(file, "utf8");
      const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
      const parsed = JSON.parse(content) as unknown;
      const validated = rawSpawnPoolFileSchema.safeParse(parsed);
      if (!validated.success) {
        const issues = validated.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        failures.push({ file: relative, message: `JSON inválido (${issues})` });
        continue;
      }
      if (!isPoolEnabled(validated.data)) {
        continue;
      }
      sourcePaths.push(relative);
      const namespace = namespaceFromPath(relative);
      for (const spawn of validated.data.spawns) {
        entries.push(normalizeEntry(spawn, validated.data, namespace, relative, sha256));
      }
    } catch (error) {
      const message =
        error instanceof SyntaxError ? `JSON malformado (${error.message})` : String(error);
      failures.push({ file: relative, message });
    }
  }

  if (failures.length > 0) {
    throw new SnapshotImportError(failures);
  }

  sortEntries(entries);
  const contentSha256 = createHash("sha256").update(JSON.stringify(entries), "utf8").digest("hex");

  const snapshot: SpawnSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    importerVersion: IMPORTER_VERSION,
    cobblemonVersion: options.cobblemonVersion,
    modpackVersion: options.modpackVersion,
    serverId: options.serverId,
    sourcePaths: [...sourcePaths].sort(),
    entryCount: entries.length,
    contentSha256,
    entries,
  };

  return { snapshot, fileCount: sourcePaths.length };
}

export function verifySnapshotIntegrity(snapshot: SpawnSnapshot): boolean {
  if (snapshot.entryCount !== snapshot.entries.length) return false;
  const hash = createHash("sha256").update(JSON.stringify(snapshot.entries), "utf8").digest("hex");
  return hash === snapshot.contentSha256;
}

async function collectSpawnPoolFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  await walk(root, (fullPath, segments) => {
    const poolIndex = segments.indexOf(SPAWN_POOL_DIR);
    if (
      poolIndex !== -1 &&
      segments.slice(0, poolIndex).includes("data") &&
      fullPath.endsWith(".json")
    ) {
      found.push(fullPath);
    }
  });
  return found.sort();
}

async function walk(
  dir: string,
  visit: (fullPath: string, segments: string[]) => void,
): Promise<void> {
  const dirents = await readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      await walk(fullPath, visit);
    } else if (dirent.isFile()) {
      visit(fullPath, fullPath.split(path.sep));
    }
  }
}

function namespaceFromPath(relativePath: string): string {
  const segments = relativePath.split(path.sep);
  const dataIndex = segments.indexOf("data");
  if (dataIndex !== -1 && segments[dataIndex + 1]) {
    return segments[dataIndex + 1]!;
  }
  return "unknown";
}

function isPoolEnabled(file: RawSpawnPoolFile): boolean {
  if (file.enabled === false || file.enabled === "false") return false;
  return true;
}

function normalizeEntry(
  spawn: RawSpawn,
  file: RawSpawnPoolFile,
  namespace: string,
  relativeFile: string,
  sha256: string,
): NormalizedSpawnEntry {
  const { pokemon, form } = splitPokemonIdentifier(spawn.pokemon);
  const handledKeys = new Set([
    "id",
    "pokemon",
    "presets",
    "type",
    "spawnablePositionType",
    "bucket",
    "weight",
    "level",
    "condition",
    "anticondition",
    "anticonditions",
  ]);
  const unsupportedFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spawn)) {
    if (!handledKeys.has(key) && value !== undefined) {
      unsupportedFields[key] = value;
    }
  }

  return {
    id: spawn.id,
    namespace,
    pokemon,
    form,
    aspects: Array.isArray(spawn["aspects"]) ? (spawn["aspects"] as string[]) : [],
    type: typeof spawn.type === "string" ? spawn.type : "pokemon",
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- context is always stringified via ternary, String() guard is present
    context: spawn["context"] !== undefined ? String(spawn["context"]) : undefined,
    positionType: spawn.spawnablePositionType,
    bucket: spawn.bucket,
    weight: spawn.weight,
    level: parseLevel(spawn.level),
    presets: spawn.presets ?? [],
    conditions: normalizeConditions(spawn.condition),
    anticonditions: normalizeConditions(spawn.anticondition ?? spawn.anticonditions),
    requiredMods: file.neededInstalledMods ?? [],
    excludedMods: file.neededUninstalledMods ?? [],
    source: { file: relativeFile, sha256 },
    unsupportedFields,
  };
}

function splitPokemonIdentifier(identifier: string): { pokemon: string; form?: string } {
  const colonIndex = identifier.indexOf(":");
  const bare = colonIndex !== -1 ? (identifier.slice(colonIndex + 1) ?? identifier) : identifier;
  const formMatch =
    /^([a-z0-9-]+?)-(?:wash|heat|frost|fan|mow|origin|altered|attack|defense|speed|alola|galar|hisui|paldea|mega-x|mega-y|crowned|zen|therian|incarnate|white|black|dusk|dawn|ultra)$/i.exec(
      bare,
    );
  if (formMatch && formMatch[1] && formMatch[2]) {
    return { pokemon: formMatch[1], form: formMatch[2] };
  }
  return { pokemon: bare };
}

function parseLevel(level: RawSpawn["level"]): NormalizedLevelRange | undefined {
  if (level === undefined) return undefined;
  if (typeof level === "number") {
    return { minimum: level, maximum: level, raw: String(level) };
  }
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(level);
  if (range && range[1] && range[2]) {
    return {
      minimum: Number.parseInt(range[1], 10),
      maximum: Number.parseInt(range[2], 10),
      raw: level,
    };
  }
  return { raw: level };
}

function normalizeConditions(condition: RawSpawnCondition | undefined): NormalizedSpawnConditions {
  if (!condition) {
    return { biomes: [], timeRanges: [], weathers: [], moonPhases: [], extra: {} };
  }
  const handled = new Set([
    "biomes",
    "timeRange",
    "timeRanges",
    "weather",
    "weathers",
    "moonPhase",
    "moonPhases",
    "minSkyLight",
    "maxSkyLight",
    "minBlockLight",
    "maxBlockLight",
    "needsSeeSky",
    "canSeeSky",
    "maxDepth",
    "minDepth",
  ]);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(condition)) {
    if (!handled.has(key) && value !== undefined) {
      extra[key] = value;
    }
  }
  const result: NormalizedSpawnConditions = {
    biomes: condition.biomes ?? [],
    timeRanges: condition.timeRange ?? condition.timeRanges ?? [],
    weathers: condition.weather ?? condition.weathers ?? [],
    moonPhases: condition.moonPhase ?? condition.moonPhases ?? [],
    extra,
  };
  if (condition.minSkyLight !== undefined || condition.maxSkyLight !== undefined) {
    result.skyLight = { minimum: condition.minSkyLight, maximum: condition.maxSkyLight };
  }
  if (condition.minBlockLight !== undefined || condition.maxBlockLight !== undefined) {
    result.blockLight = { minimum: condition.minBlockLight, maximum: condition.maxBlockLight };
  }
  if (condition.needsSeeSky !== undefined) result.needsSeeSky = condition.needsSeeSky;
  if (condition.canSeeSky !== undefined) result.needsSeeSky = condition.canSeeSky;
  if (condition.maxDepth !== undefined) result.maxDepth = condition.maxDepth;
  if (condition.minDepth !== undefined) result.minDepth = condition.minDepth;
  return result;
}

function sortEntries(entries: NormalizedSpawnEntry[]): void {
  entries.sort((a, b) => {
    const pokemonCompare = a.pokemon.localeCompare(b.pokemon);
    if (pokemonCompare !== 0) return pokemonCompare;
    const idCompare = a.id.localeCompare(b.id);
    if (idCompare !== 0) return idCompare;
    return a.source.file.localeCompare(b.source.file);
  });
}

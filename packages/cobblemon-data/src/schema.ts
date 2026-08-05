import { z } from "zod";

export interface NormalizedLevelRange {
  minimum?: number;
  maximum?: number;
  raw?: string;
}

export interface NormalizedSpawnConditions {
  biomes: string[];
  timeRanges: string[];
  weathers: string[];
  moonPhases: string[];
  skyLight?: { minimum?: number; maximum?: number };
  blockLight?: { minimum?: number; maximum?: number };
  needsSeeSky?: boolean;
  maxDepth?: number;
  minDepth?: number;
  extra: Record<string, unknown>;
}

export interface NormalizedSpawnEntry {
  id: string;
  namespace: string;
  pokemon: string;
  form?: string;
  aspects: string[];
  type: string;
  context?: string;
  positionType?: string;
  bucket?: string;
  weight?: number;
  level?: NormalizedLevelRange;
  presets: string[];
  conditions: NormalizedSpawnConditions;
  anticonditions: NormalizedSpawnConditions;
  requiredMods: string[];
  excludedMods: string[];
  source: {
    file: string;
    sha256: string;
  };
  unsupportedFields: Record<string, unknown>;
}

export interface SpawnSnapshotManifest {
  schemaVersion: number;
  generatedAt: string;
  importerVersion: string;
  cobblemonVersion?: string;
  modpackVersion?: string;
  serverId: string;
  sourcePaths: string[];
  entryCount: number;
  contentSha256: string;
}

export interface SpawnSnapshot extends SpawnSnapshotManifest {
  entries: NormalizedSpawnEntry[];
}

export interface ImportFailure {
  file: string;
  message: string;
}

export class SnapshotImportError extends Error {
  public readonly failures: ImportFailure[];
  constructor(failures: ImportFailure[]) {
    super(
      `Falha ao importar snapshot de spawns: ${failures
        .map((failure) => `${failure.file}: ${failure.message}`)
        .join("; ")}`,
    );
    this.name = "SnapshotImportError";
    this.failures = failures;
  }
}

const rawConditionSchema = z
  .object({
    biomes: z.array(z.string()).optional(),
    timeRange: z.array(z.string()).optional(),
    timeRanges: z.array(z.string()).optional(),
    weather: z.array(z.string()).optional(),
    weathers: z.array(z.string()).optional(),
    moonPhase: z.array(z.string()).optional(),
    moonPhases: z.array(z.string()).optional(),
    minSkyLight: z.number().optional(),
    maxSkyLight: z.number().optional(),
    minBlockLight: z.number().optional(),
    maxBlockLight: z.number().optional(),
    needsSeeSky: z.boolean().optional(),
    canSeeSky: z.boolean().optional(),
    maxDepth: z.number().optional(),
    minDepth: z.number().optional(),
  })
  .catchall(z.unknown());

const rawSpawnSchema = z
  .object({
    id: z.string(),
    pokemon: z.string(),
    presets: z.array(z.string()).optional(),
    type: z.string().optional(),
    spawnablePositionType: z.string().optional(),
    bucket: z.string().optional(),
    weight: z.number().optional(),
    level: z.union([z.string(), z.number()]).optional(),
    condition: rawConditionSchema.optional(),
    anticondition: rawConditionSchema.optional(),
    anticonditions: rawConditionSchema.optional(),
    specialConditions: z.unknown().optional(),
  })
  .catchall(z.unknown());

export const rawSpawnPoolFileSchema = z
  .object({
    enabled: z.union([z.boolean(), z.string()]).optional(),
    neededInstalledMods: z.array(z.string()).optional(),
    neededUninstalledMods: z.array(z.string()).optional(),
    spawns: z.array(rawSpawnSchema),
  })
  .catchall(z.unknown());

export type RawSpawnPoolFile = z.infer<typeof rawSpawnPoolFileSchema>;
export type RawSpawn = z.infer<typeof rawSpawnSchema>;
export type RawSpawnCondition = z.infer<typeof rawConditionSchema>;

export const snapshotEntrySchema: z.ZodType<NormalizedSpawnEntry> = z.object({
  id: z.string(),
  namespace: z.string(),
  pokemon: z.string(),
  form: z.string().optional(),
  aspects: z.array(z.string()),
  type: z.string(),
  context: z.string().optional(),
  positionType: z.string().optional(),
  bucket: z.string().optional(),
  weight: z.number().optional(),
  level: z
    .object({
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      raw: z.string().optional(),
    })
    .optional(),
  presets: z.array(z.string()),
  conditions: z.object({
    biomes: z.array(z.string()),
    timeRanges: z.array(z.string()),
    weathers: z.array(z.string()),
    moonPhases: z.array(z.string()),
    skyLight: z
      .object({ minimum: z.number().optional(), maximum: z.number().optional() })
      .optional(),
    blockLight: z
      .object({ minimum: z.number().optional(), maximum: z.number().optional() })
      .optional(),
    needsSeeSky: z.boolean().optional(),
    maxDepth: z.number().optional(),
    minDepth: z.number().optional(),
    extra: z.record(z.string(), z.unknown()),
  }),
  anticonditions: z.object({
    biomes: z.array(z.string()),
    timeRanges: z.array(z.string()),
    weathers: z.array(z.string()),
    moonPhases: z.array(z.string()),
    skyLight: z
      .object({ minimum: z.number().optional(), maximum: z.number().optional() })
      .optional(),
    blockLight: z
      .object({ minimum: z.number().optional(), maximum: z.number().optional() })
      .optional(),
    needsSeeSky: z.boolean().optional(),
    maxDepth: z.number().optional(),
    minDepth: z.number().optional(),
    extra: z.record(z.string(), z.unknown()),
  }),
  requiredMods: z.array(z.string()),
  excludedMods: z.array(z.string()),
  source: z.object({ file: z.string(), sha256: z.string() }),
  unsupportedFields: z.record(z.string(), z.unknown()),
});

export const snapshotSchema: z.ZodType<SpawnSnapshot> = z.object({
  schemaVersion: z.number(),
  generatedAt: z.string(),
  importerVersion: z.string(),
  cobblemonVersion: z.string().optional(),
  modpackVersion: z.string().optional(),
  serverId: z.string(),
  sourcePaths: z.array(z.string()),
  entryCount: z.number(),
  contentSha256: z.string(),
  entries: z.array(snapshotEntrySchema),
});

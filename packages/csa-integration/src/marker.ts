import type { SpawnAlertEvent } from "@bigbangcraft/domain";

export const CSA_MARKER = "PC_CSA_V1";
const FIELD_SEPARATOR = "|";

export interface MarkerParseResult {
  event: Partial<SpawnAlertEvent>;
  confidence: "high" | "low";
  rawMarker?: string;
}

export function buildMarkerTemplate(): string {
  return [
    CSA_MARKER,
    "dex={dex_unformatted}",
    "lvl={level_unformatted}",
    "x={x}",
    "y={y}",
    "z={z}",
    "biome={biome_unformatted}",
    "bucket={bucket_unformatted}",
    "shiny={shiny_unformatted}",
    "leg={legendary_unformatted}",
    "myth={mythical_unformatted}",
    "ub={ultrabeast_unformatted}",
    "par={paradox_unformatted}",
    "ha={hidden_ability_unformatted}",
    "name={name}",
    "player={nearest_player_unformatted}",
    "ts={timestamp}",
  ].join(FIELD_SEPARATOR);
}

export function parseMarkerFromContent(content: string | undefined): MarkerParseResult | null {
  if (!content) return null;
  const markerIndex = content.indexOf(CSA_MARKER);
  if (markerIndex === -1) return null;
  const line = content.slice(markerIndex).split("\n")[0]?.trim();
  if (!line) return null;
  return parseMarkerLine(line);
}

export function parseMarkerLine(line: string): MarkerParseResult | null {
  if (!line.startsWith(CSA_MARKER)) return null;
  const segments = line.split(FIELD_SEPARATOR);
  const fields = new Map<string, string>();
  for (const segment of segments.slice(1)) {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();
    if (key) fields.set(key, value);
  }
  if (fields.size === 0) return null;

  const event: Partial<SpawnAlertEvent> = { source: "csa", parsedConfidence: "high" };

  const dex = parseOptionalInt(fields.get("dex"));
  if (dex !== undefined && dex > 0) event.dexNumber = dex;

  const level = parseOptionalInt(fields.get("lvl"));
  if (level !== undefined && level > 0 && level <= 200) event.level = level;

  const x = parseCoordinate(fields.get("x"));
  const y = parseCoordinate(fields.get("y"));
  const z = parseCoordinate(fields.get("z"));
  if (x !== undefined || y !== undefined || z !== undefined) {
    event.coordinates = { x, y, z };
  }

  const biome = parseRequiredValue(fields.get("biome"));
  if (biome) event.biome = biome;

  const bucket = parseRequiredValue(fields.get("bucket"));
  if (bucket) event.bucket = bucket;

  event.shiny = parseFlag(fields.get("shiny"));
  event.legendary = parseFlag(fields.get("leg"));
  event.mythical = parseFlag(fields.get("myth"));
  event.ultraBeast = parseFlag(fields.get("ub"));
  event.paradox = parseFlag(fields.get("par"));
  event.hiddenAbility = parseFlag(fields.get("ha"));

  const name = parseRequiredValue(fields.get("name"));
  if (name) event.displayName = name;

  const player = parseRequiredValue(fields.get("player"));
  if (player) event.nearestPlayer = player;

  const timestamp = parseOptionalInt(fields.get("ts"));
  if (timestamp !== undefined && timestamp > 0) {
    event.receivedAt = new Date(timestamp * 1000).toISOString();
  }

  return { event, confidence: "high", rawMarker: line };
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value || value === "N/A") return undefined;
  const numeric = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
}

function parseCoordinate(value: string | undefined): number | undefined {
  if (!value || value === "N/A") return undefined;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return undefined;
  if (Math.abs(numeric) > 60_000_000) return undefined;
  return numeric;
}

function parseRequiredValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed === "N/A") return undefined;
  return trimmed;
}

function parseFlag(value: string | undefined): boolean {
  const cleaned = parseRequiredValue(value);
  if (!cleaned) return false;
  return cleaned.toLowerCase() !== "false";
}

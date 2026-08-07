import {
  isLifecycleStatus,
  isSpawnOrigin,
  isLocationVisibility,
  parseStatusFromPortuguese,
  type SpawnLifecycleEvent,
  type SpawnLifecycleStatus,
} from "@bigbangcraft/domain";

export const BBSA_MARKER = "PC_BBSA_V2";
export const BBSA_MARKER_VERSION = "V2";
const FIELD_SEPARATOR = "|";

export const BBSA_MARKER_LIMITS = {
  maxLineLength: 4096,
  maxSpeciesLength: 256,
  maxPokemonLength: 256,
  maxBiomeLength: 200,
  maxBucketLength: 64,
  maxPlayerLength: 100,
  maxLevel: 200,
  minLevel: 1,
  maxAbsCoordinate: 60_000_000,
  maxDexNumber: 10_000,
} as const;

export interface BbsaMarkerResult {
  event: Partial<SpawnLifecycleEvent>;
  confidence: "high" | "low";
  rawMarker?: string;
}

export function parseBbsaMarker(content: string | undefined): BbsaMarkerResult | null {
  if (!content) return null;
  const markerIndex = content.indexOf(BBSA_MARKER);
  if (markerIndex === -1) return null;
  const line = content.slice(markerIndex).split("\n")[0]?.trim();
  if (!line) return null;
  return parseBbsaMarkerLine(line);
}

export function parseBbsaMarkerLine(line: string): BbsaMarkerResult | null {
  if (!line.startsWith(BBSA_MARKER)) return null;
  if (line.length > BBSA_MARKER_LIMITS.maxLineLength) return null;

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

  const event: Partial<SpawnLifecycleEvent> = { parsedConfidence: "high" };
  let confidence: "high" | "low" = "high";

  const spawnAlertId = fields.get("spawn_alert_id");
  if (spawnAlertId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(spawnAlertId)) {
    event.spawnAlertId = spawnAlertId.toLowerCase();
  } else {
    confidence = "low";
  }

  const statusKey = fields.get("status_key");
  if (statusKey && isLifecycleStatus(statusKey)) {
    event.statusKey = statusKey;
  }

  const statusText = fields.get("status");
  const resolvedStatus = resolveStatus(statusKey, statusText);
  if (resolvedStatus) {
    event.status = resolvedStatus;
  } else {
    confidence = "low";
  }

  event.species = parseField(fields.get("species"), BBSA_MARKER_LIMITS.maxSpeciesLength);
  event.displayName = parseField(fields.get("pokemon"), BBSA_MARKER_LIMITS.maxPokemonLength);

  const form = fields.get("form");
  if (form && form !== "N/A") {
    event.form = form.slice(0, 100);
  }

  const level = parseOptionalInt(fields.get("level"));
  if (level !== undefined && level >= BBSA_MARKER_LIMITS.minLevel && level <= BBSA_MARKER_LIMITS.maxLevel) {
    event.level = level;
  } else if (level !== undefined) {
    confidence = "low";
  }

  event.shiny = parseBooleanFlag(fields.get("shiny"));

  const rarity = parseField(fields.get("rarity"), BBSA_MARKER_LIMITS.maxBucketLength);
  if (rarity !== undefined) {
    event.rarity = rarity;
    event.bucket = rarity;
  }

  const spawnOrigin = fields.get("spawn_origin");
  if (spawnOrigin && isSpawnOrigin(spawnOrigin)) {
    event.spawnOrigin = spawnOrigin;
  }

  event.worldDisplayName = parseOptionalNaValue(fields.get("world"));
  event.worldKey = parseOptionalNaValue(fields.get("world_key"));
  event.dimensionKey = parseOptionalNaValue(fields.get("dimension_key"));
  event.biome = parseOptionalNaValue(fields.get("biome"));

  const x = parseCoordinate(fields.get("x"));
  const y = parseCoordinate(fields.get("y"));
  const z = parseCoordinate(fields.get("z"));
  const hasApprox = (fields.get("x") ?? "").includes("\u2248") || (fields.get("z") ?? "").includes("\u2248");
  if (x !== undefined || y !== undefined || z !== undefined) {
    event.coordinates = { x, y, z, approximate: hasApprox };
  }

  const locationVisibility = fields.get("location_visibility");
  if (locationVisibility && isLocationVisibility(locationVisibility)) {
    event.locationVisibility = locationVisibility;
  }

  const player = parseOptionalNaValue(fields.get("player"));
  if (player !== undefined) event.playerName = player;

  const spawnTime = fields.get("spawn_time");
  if (spawnTime) {
    event.spawnedAt = new Date(spawnTime).toISOString();
  }

  event.elapsedTime = fields.get("elapsed_time") ?? undefined;
  event.resolvedTime = fields.get("resolved_time") ?? undefined;

  const alertReasonsRaw = fields.get("alert_reasons");
  if (alertReasonsRaw && alertReasonsRaw !== "N/A") {
    event.alertReasons = alertReasonsRaw.split(",").map((r) => r.replace(/%2C/g, ",")).filter(Boolean);
  }

  const matchedRuleIdsRaw = fields.get("matched_rule_ids");
  if (matchedRuleIdsRaw && matchedRuleIdsRaw !== "N/A") {
    event.matchedRuleIds = matchedRuleIdsRaw.split(",").map((r) => r.replace(/%2C/g, ",")).filter(Boolean);
  }

  event.parsedConfidence = confidence;
  return { event, confidence, rawMarker: line };
}

function resolveStatus(
  statusKey: string | undefined,
  statusText: string | undefined,
): SpawnLifecycleStatus | undefined {
  if (statusKey && isLifecycleStatus(statusKey)) {
    return statusKey;
  }
  if (statusText) {
    const fromPt = parseStatusFromPortuguese(statusText);
    if (fromPt) return fromPt;
  }
  return "UNKNOWN";
}

function parseField(value: string | undefined, maxLength: number): string | undefined {
  if (!value || value === "N/A") return undefined;
  const decoded = value.replace(/%7C/g, "|").replace(/%5C/g, "\\");
  const cleaned = decoded
    .normalize("NFKC")
    .replace(/<[a-z][^>]*>/gi, "")
    .replace(/<\/[a-z][^>]*>/gi, "")
    .replace(/[*_~`|#>]/g, " ")
    .replace(/\[/g, "(").replace(/\]/g, ")")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLength);
}

function parseOptionalNaValue(value: string | undefined): string | undefined {
  if (!value || value === "N/A" || value === "null") return undefined;
  return value.slice(0, 256);
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value || value === "N/A") return undefined;
  const numeric = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
}

function parseCoordinate(value: string | undefined): number | undefined {
  if (!value || value === "N/A" || value === "null") return undefined;
  const cleaned = value.replace(/\u2248\s?/, "").trim();
  const numeric = Number.parseFloat(cleaned);
  if (!Number.isFinite(numeric)) return undefined;
  if (Math.abs(numeric) > BBSA_MARKER_LIMITS.maxAbsCoordinate) return undefined;
  return numeric;
}

function parseBooleanFlag(value: string | undefined): boolean | undefined {
  if (!value || value === "N/A") return false;
  const lower = value.toLowerCase().trim();
  if (lower === "shiny" || lower === "✨ shiny") return true;
  return false;
}

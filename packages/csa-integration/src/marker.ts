import type { SpawnAlertEvent } from "@bigbangcraft/domain";

/**
 * Marcador machine-readable inserido no campo `content` do webhook CSA 1.13.2.
 *
 * Os placeholders foram confirmados contra o bytecode do JAR
 * (io.github.stainlessstasis.alert.DynamicReplacements + assets lang/en_us.json):
 *
 * - `{dex_unformatted}`   -> número da Pokédex (ex.: "25")
 * - `{level_unformatted}` -> nível (ex.: "50")
 * - `{x}`/`{y}`/`{z}`     -> coordenadas truncadas para inteiro ("N/A" quando inválidas)
 * - `{biome_unformatted}` -> último segmento da biome key, "embelezado" (ex.: "Savanna")
 * - `{bucket_unformatted}`-> "Common" | "Uncommon" | "Rare" | "Ultra Rare" | "N/A"
 * - `{shiny_unformatted}` -> "Shiny " (com espaço) quando shiny; "" caso contrário
 * - `{legendary_unformatted}` -> valor ÚNICO e mutuamente exclusivo:
 *      "Legendary" | "Mythical" | "Ultra Beast" | "Paradox" | ""
 *      (a cadeia if/else do JAR retorna apenas o primeiro flag verdadeiro:
 *       legendary > mythical > ultrabeast > paradox)
 * - `{hidden_ability_unformatted}` -> "Hidden Ability " quando HA; "" caso contrário
 * - `{name}`             -> nome da espécie traduzido pelo Cobblemon
 * - `{nearest_player_unformatted}` -> nome do jogador mais próximo
 * - `{timestamp}`        -> epoch em MILISSEGUNDOS (System.currentTimeMillis())
 *
 * IMPORTANTE: os aliases {mythical_unformatted}, {ultrabeast_unformatted} e
 * {paradox_unformatted} resolvem para o MESMO Tag LEGENDARY do JAR e produzem o
 * mesmo valor único — por isso o marcador usa um único campo `rarity`.
 */
export const CSA_MARKER = "PC_CSA_V1";
export const CSA_MARKER_VERSION = "V1";
const FIELD_SEPARATOR = "|";

/** Limites defensivos aplicados pelo parser (não existem limites no JAR). */
export const MARKER_LIMITS = {
  maxLineLength: 4096,
  maxNameLength: 256,
  maxBiomeLength: 200,
  maxBucketLength: 64,
  maxPlayerLength: 100,
  maxLevel: 200,
  minLevel: 1,
  maxAbsCoordinate: 60_000_000,
  maxDexNumber: 10_000,
} as const;

export interface MarkerParseResult {
  event: Partial<SpawnAlertEvent>;
  confidence: "high" | "low";
  rawMarker?: string;
}

/**
 * Constrói o template do marcador com os placeholders confirmados no JAR 1.13.2.
 */
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
    "rarity={legendary_unformatted}",
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
  if (line.length > MARKER_LIMITS.maxLineLength) return null;

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
  let confidence: "high" | "low" = "high";

  const dex = parseOptionalInt(fields.get("dex"));
  if (dex !== undefined && dex >= 1 && dex <= MARKER_LIMITS.maxDexNumber) {
    event.dexNumber = dex;
  } else if (dex !== undefined) {
    confidence = "low";
  }

  const level = parseOptionalInt(fields.get("lvl"));
  if (level !== undefined && level >= MARKER_LIMITS.minLevel && level <= MARKER_LIMITS.maxLevel) {
    event.level = level;
  } else if (level !== undefined) {
    confidence = "low";
  }

  const x = parseCoordinate(fields.get("x"));
  const y = parseCoordinate(fields.get("y"));
  const z = parseCoordinate(fields.get("z"));
  if (x !== undefined || y !== undefined || z !== undefined) {
    event.coordinates = { x, y, z };
  }
  if (
    hasInvalidCoordinate(fields.get("x"), x) ||
    hasInvalidCoordinate(fields.get("y"), y) ||
    hasInvalidCoordinate(fields.get("z"), z)
  ) {
    confidence = "low";
  }

  const biome = parseRequiredValue(fields.get("biome"), MARKER_LIMITS.maxBiomeLength);
  if (biome !== undefined) event.biome = biome;

  const bucket = parseRequiredValue(fields.get("bucket"), MARKER_LIMITS.maxBucketLength);
  if (bucket !== undefined) event.bucket = bucket;
  event.rarity = bucket;

  const shiny = parseShinyFlag(fields.get("shiny"));
  if (shiny !== "unknown") {
    event.shiny = shiny;
  } else {
    confidence = "low";
  }

  const rarity = parseRarityFlag(fields.get("rarity"));
  if (rarity !== "unknown") {
    event.legendary = rarity.legendary;
    event.mythical = rarity.mythical;
    event.ultraBeast = rarity.ultraBeast;
    event.paradox = rarity.paradox;
  } else {
    confidence = "low";
  }

  const hiddenAbility = parseHiddenAbilityFlag(fields.get("ha"));
  if (hiddenAbility !== "unknown") {
    event.hiddenAbility = hiddenAbility;
  } else {
    confidence = "low";
  }

  const name = parseRequiredValue(fields.get("name"), MARKER_LIMITS.maxNameLength);
  if (name !== undefined) event.displayName = name;

  const player = parseRequiredValue(fields.get("player"), MARKER_LIMITS.maxPlayerLength);
  if (player !== undefined) event.nearestPlayer = player;

  const timestamp = parseTimestamp(fields.get("ts"));
  if (timestamp !== undefined) {
    event.receivedAt = new Date(timestamp).toISOString();
  } else {
    confidence = "low";
  }

  event.parsedConfidence = confidence;
  return { event, confidence, rawMarker: line };
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value || value === "N/A") return undefined;
  const numeric = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
}

function parseCoordinate(value: string | undefined): number | undefined {
  if (!value || value === "N/A" || value === "null") return undefined;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return undefined;
  if (Math.abs(numeric) > MARKER_LIMITS.maxAbsCoordinate) return undefined;
  return numeric;
}

function hasInvalidCoordinate(raw: string | undefined, parsed: number | undefined): boolean {
  if (!raw || raw === "N/A" || raw === "null") return false;
  return parsed === undefined;
}

/**
 * Normaliza o valor e remove markup do Discord (negrito, itálico, spoiler,
 * sublinhado, código) e tags de markup do Ember's Text API ("<color ...>").
 */
function normalizeValue(value: string): string {
  const nfkc = value.normalize("NFKC");
  const withoutMarkup = nfkc
    .replace(/<[a-z][^>]*>/gi, "")
    .replace(/<\/[a-z][^>]*>/gi, "")
    .replace(/[*_~`|#>]/g, " ")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")");
  return withoutMarkup.replace(/\s+/g, " ").trim();
}

function parseRequiredValue(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  const cleaned = normalizeValue(value);
  if (!cleaned || cleaned === "N/A" || cleaned === "null") return undefined;
  return cleaned.slice(0, maxLength);
}

type TriState = boolean | "unknown";

/**
 * Strings exatas geradas pelo JAR para {shiny_unformatted}:
 * - "Shiny " (trailing space, lang en_us) quando shiny
 * - "" quando não shiny
 * - "N/A" quando o template não está disponível
 *
 * NUNCA tratamos texto não vazio desconhecido como `true`.
 */
function parseShinyFlag(value: string | undefined): TriState {
  if (value === undefined) return "unknown";
  const cleaned = normalizeValue(value);
  if (!cleaned || cleaned === "N/A") return false;
  if (cleaned.toLowerCase() === "shiny") return true;
  return "unknown";
}

/**
 * Strings exatas geradas pelo JAR para {legendary_unformatted} (valor único):
 * "Legendary" | "Mythical" | "Ultra Beast" | "Paradox" | "" | "N/A".
 */
function parseRarityFlag(
  value: string | undefined,
): { legendary: boolean; mythical: boolean; ultraBeast: boolean; paradox: boolean } | "unknown" {
  if (value === undefined) return "unknown";
  const cleaned = normalizeValue(value);
  if (!cleaned || cleaned === "N/A") {
    return { legendary: false, mythical: false, ultraBeast: false, paradox: false };
  }
  const lower = cleaned.toLowerCase();
  if (lower === "legendary")
    return { legendary: true, mythical: false, ultraBeast: false, paradox: false };
  if (lower === "mythical")
    return { legendary: false, mythical: true, ultraBeast: false, paradox: false };
  if (lower === "ultra beast")
    return { legendary: false, mythical: false, ultraBeast: true, paradox: false };
  if (lower === "paradox")
    return { legendary: false, mythical: false, ultraBeast: false, paradox: true };
  return "unknown";
}

/**
 * Strings exatas geradas pelo JAR para {hidden_ability_unformatted}:
 * "Hidden Ability " (trailing space) quando HA; "" caso contrário.
 */
function parseHiddenAbilityFlag(value: string | undefined): TriState {
  if (value === undefined) return "unknown";
  const cleaned = normalizeValue(value);
  if (!cleaned || cleaned === "N/A") return false;
  if (cleaned.toLowerCase() === "hidden ability") return true;
  return "unknown";
}

/**
 * O JAR envia epoch em MILISSEGUNDOS (System.currentTimeMillis()).
 * Valores >= 1e12 são tratados como milissegundos; valores entre 1e9 e 1e12
 * como segundos (tolerância para clientes antigos). Abaixo disso: descartado.
 */
function parseTimestamp(value: string | undefined): number | undefined {
  if (!value || value === "N/A") return undefined;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  if (numeric >= 1e12) return Math.trunc(numeric);
  if (numeric >= 1e9) return Math.trunc(numeric * 1000);
  return undefined;
}

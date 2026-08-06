import type { NormalizedSpawnConditions, NormalizedSpawnEntry } from "./schema.js";

const TIME_LABELS_PT: Record<string, string> = {
  DAY: "dia",
  NIGHT: "noite",
  DUSK: "anoitecer",
  DAWN: "amanhecer",
  MORNING: "manhã",
};

const WEATHER_LABELS_PT: Record<string, string> = {
  CLEAR: "céu limpo",
  RAIN: "chuva",
  THUNDER: "tempestade",
  SNOW: "neve",
  DRAKESNOW: "neve pesada",
  HEATWAVE: "onda de calor",
  SANDSTORM: "tempestade de areia",
  HAIL: "granizo",
};

const MOON_PHASES_PT: Record<string, string> = {
  "0": "lua nova",
  "1": "lua crescente",
  "2": "quarto crescente",
  "3": "lua gibosa crescente",
  "4": "lua cheia",
  "5": "lua gibosa minguante",
  "6": "quarto minguante",
  "7": "lua minguante",
};

const POSITION_LABELS_PT: Record<string, string> = {
  grounded: "no chão",
  water: "na água",
  underwater: "submerso",
  air: "no ar",
  fishing: "na pesca",
  lava: "na lava",
  ceiling: "em tetos",
  "tree-top": "no topo de árvores",
  tree_top: "no topo de árvores",
  underground: "subterrâneo",
  surface: "na superfície",
  cave: "em cavernas",
};

const RARITY_LABELS_PT: Record<string, string> = {
  common: "Comum",
  uncommon: "Incomum",
  rare: "Raro",
  "ultra-rare": "Ultra raro",
  legendary: "Lendário",
  mythical: "Mítico",
  starter: "Inicial",
};

const PRESET_LABELS_PT: Record<string, string> = {
  natural: "natural",
  daytime: "durante o dia",
  nighttime: "durante a noite",
  underwater: "submerso",
  lava: "em lava",
  grass: "em grama alta",
  trees: "em árvores",
  snow: "na neve",
  sand: "na areia",
  swamps: "em pântanos",
  water: "na água",
  cave: "em cavernas",
};

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

const KNOWN_EXTRA_KEYS_PT: Record<string, string> = {
  minlurelevel: "nível mínimo de isca",
  israining: "chovendo",
  isthundering: "trovejando",
  minperfectivs: "IVs perfeitos mínimos",
  min_perfect_ivs: "IVs perfeitos mínimos",
};

const BIOME_LABELS_PT: Record<string, string> = {
  aether: "Éter",
  arid: "Árido",
  badlands: "Badlands",
  bamboo: "Bambuzal",
  beach: "Praia",
  cave: "Caverna",
  cherry_blossom: "Cerejeiras",
  coast: "Costa",
  cold: "Frio",
  cold_ocean: "Oceano frio",
  deep_dark: "Escuridão profunda",
  deep_ocean: "Oceano profundo",
  desert: "Deserto",
  dripstone: "Estalactites",
  end: "End",
  floral: "Flores",
  forest: "Floresta",
  freezing: "Gélido",
  freshwater: "Água doce",
  frozen_ocean: "Oceano congelado",
  glacial: "Glacial",
  grassland: "Campo",
  highlands: "Terras altas",
  hills: "Colinas",
  island: "Ilha",
  jungle: "Selva",
  lukewarm_ocean: "Oceano morno",
  lush: "Verdente",
  magical: "Mágico",
  mountain: "Montanha",
  mushroom: "Cogumelos",
  nether: "Nether",
  ocean: "Oceano",
  overworld: "Mundo superior",
  peak: "Pico",
  plains: "Planícies",
  plateau: "Planalto",
  river: "Rio",
  sandy: "Arenoso",
  savanna: "Savana",
  shrubland: "Arbustos",
  sky: "Céu",
  snowy: "Nevado",
  snowy_forest: "Floresta nevada",
  snowy_taiga: "Taiga nevada",
  spooky: "Assombrado",
  swamp: "Pântano",
  taiga: "Taiga",
  temperate: "Temperado",
  temperate_ocean: "Oceano temperado",
  thermal: "Termal",
  tropical_island: "Ilha tropical",
  tundra: "Tundra",
  volcanic: "Vulcânico",
  basalt: "Basalto",
  crystal_canyon: "Cânion de cristal",
  crystalline_chasm: "Abismo cristalino",
  floral_meadow: "Campo florido",
  frozen_river: "Rio congelado",
  howling_constructs: "Construções uivantes",
  mud: "Lama",
  has_block: "Bloco de",
  unknown: "desconhecido",
};

function biomePartLabel(part: string): string {
  return BIOME_LABELS_PT[part] ?? titleCase(part.replace(/_/g, " "));
}

/** Humaniza identificadores de bioma/tag: `#cobblemon:is_ocean` → "Oceano"; `nether/is_basalt` → "Basalto (Nether)"; `has_block/mud` → "Bloco de Lama". */
export function humanizeBiomePt(value: string): string {
  const clean = value.replace(/^#/, "");
  const withoutNamespace = clean.includes(":") ? clean.slice(clean.indexOf(":") + 1) : clean;
  const parts = withoutNamespace
    .split("/")
    .map((part) => part.replace(/^is_/i, "").replace(/^the_/i, "").toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return clean;
  if (parts[0] === "has_block" && parts[1]) {
    return `${biomePartLabel("has_block")} ${biomePartLabel(parts[1])}`;
  }
  if (parts.length === 1) return biomePartLabel(parts[0] ?? clean);
  const base = biomePartLabel(parts[parts.length - 1] ?? clean);
  const region = parts.slice(0, -1).map(biomePartLabel).join(" ");
  return `${base} (${region})`;
}

export function humanizePositionPt(value: string): string {
  return POSITION_LABELS_PT[value.toLowerCase()] ?? value.replace(/[-_]/g, " ");
}

export function humanizeRarityPt(value: string): string {
  return RARITY_LABELS_PT[value.toLowerCase()] ?? titleCase(value.replace(/[-_]/g, " "));
}

export function humanizePresetPt(value: string): string {
  return PRESET_LABELS_PT[value.toLowerCase()] ?? value.replace(/[-_]/g, " ");
}

function humanizeExtraKey(key: string): string {
  const known = KNOWN_EXTRA_KEYS_PT[key.toLowerCase()];
  if (known) return known;
  return titleCase(key.replace(/[-_]/g, " ").toLowerCase());
}

function formatExtraValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (typeof value === "number" || typeof value === "string") return String(value);
  return JSON.stringify(value);
}

/** Renderiza `weightMultipliers` (formato do Cobblemon) em texto amigável. */
function describeWeightMultipliers(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parts: string[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    const multiplier = typeof entry["multiplier"] === "number" ? entry["multiplier"] : undefined;
    if (multiplier === undefined) continue;
    const contexts: string[] = [];
    const biomes = entry["biomes"];
    if (Array.isArray(biomes)) {
      contexts.push(...biomes.map((biome) => humanizeBiomePt(String(biome))));
    }
    const condition = entry["condition"];
    if (typeof condition === "object" && condition !== null) {
      for (const [key, condValue] of Object.entries(condition as Record<string, unknown>)) {
        if (condValue === true) contexts.push(humanizeExtraKey(key));
      }
    }
    const contextText = contexts.length > 0 ? ` (${contexts.join(", ")})` : "";
    parts.push(`x${multiplier}${contextText}`);
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

export interface SpawnConditionSummary {
  label: string;
  value: string;
}

export function describeConditionsPt(
  condition: NormalizedSpawnConditions,
): SpawnConditionSummary[] {
  const summary: SpawnConditionSummary[] = [];
  if (condition.biomes.length > 0) {
    summary.push({
      label: "Biomas",
      value: condition.biomes.map(humanizeBiomePt).join(", "),
    });
  }
  if (condition.timeRanges.length > 0) {
    summary.push({
      label: "Período",
      value: condition.timeRanges
        .map((time) => TIME_LABELS_PT[time.toUpperCase()] ?? time.toLowerCase())
        .join(", "),
    });
  }
  if (condition.weathers.length > 0) {
    summary.push({
      label: "Clima",
      value: condition.weathers
        .map((weather) => WEATHER_LABELS_PT[weather.toUpperCase()] ?? weather.toLowerCase())
        .join(", "),
    });
  }
  if (condition.moonPhases.length > 0) {
    summary.push({
      label: "Fases da lua",
      value: condition.moonPhases
        .map((phase) => MOON_PHASES_PT[phase.trim()] ?? phase.trim())
        .join(", "),
    });
  }
  if (condition.skyLight) {
    const parts: string[] = [];
    if (condition.skyLight.minimum !== undefined) parts.push(`${condition.skyLight.minimum}`);
    if (condition.skyLight.maximum !== undefined) parts.push(`${condition.skyLight.maximum}`);
    summary.push({ label: "Luz solar", value: parts.join(" a ") });
  }
  if (condition.needsSeeSky === true) {
    summary.push({ label: "Céu aberto", value: "sim" });
  }
  if (condition.maxDepth !== undefined || condition.minDepth !== undefined) {
    const parts: string[] = [];
    if (condition.minDepth !== undefined) parts.push(`mín. ${condition.minDepth}`);
    if (condition.maxDepth !== undefined) parts.push(`máx. ${condition.maxDepth}`);
    summary.push({ label: "Profundidade", value: parts.join(", ") });
  }
  if (Object.keys(condition.extra).length > 0) {
    const extraParts: string[] = [];
    for (const [key, value] of Object.entries(condition.extra)) {
      if (value === true) {
        extraParts.push(humanizeExtraKey(key));
      } else if (value !== false) {
        extraParts.push(`${humanizeExtraKey(key)}: ${formatExtraValue(value)}`);
      }
    }
    if (extraParts.length > 0) {
      summary.push({ label: "Condições extras", value: extraParts.join("; ") });
    }
  }
  return summary;
}

export function describeEntryPt(entry: NormalizedSpawnEntry): SpawnConditionSummary[] {
  const rows: SpawnConditionSummary[] = [];
  if (entry.bucket) {
    rows.push({ label: "Raridade", value: humanizeRarityPt(entry.bucket) });
  }
  if (entry.weight !== undefined) {
    rows.push({ label: "Peso de spawn", value: String(entry.weight) });
  }
  if (entry.level) {
    rows.push({
      label: "Nível",
      value:
        entry.level.minimum !== undefined && entry.level.maximum !== undefined
          ? entry.level.minimum === entry.level.maximum
            ? String(entry.level.minimum)
            : `${entry.level.minimum} a ${entry.level.maximum}`
          : (entry.level.raw ?? "desconhecido"),
    });
  }
  if (entry.context) rows.push({ label: "Contexto", value: entry.context });
  if (entry.positionType) {
    rows.push({ label: "Obtido", value: humanizePositionPt(entry.positionType) });
  }
  if (entry.presets.length > 0) {
    rows.push({
      label: "Local típico",
      value: entry.presets.map(humanizePresetPt).join(", "),
    });
  }
  rows.push(...describeConditionsPt(entry.conditions));
  if (
    entry.anticonditions.biomes.length > 0 ||
    Object.keys(entry.anticonditions.extra).length > 0
  ) {
    const anti = describeConditionsPt(entry.anticonditions);
    if (anti.length > 0) {
      rows.push({
        label: "Não aparece quando",
        value: anti.map((row) => `${row.label.toLowerCase()}: ${row.value}`).join("; "),
      });
    }
  }
  if (entry.requiredMods.length > 0)
    rows.push({ label: "Mods necessários", value: entry.requiredMods.join(", ") });
  if (entry.excludedMods.length > 0)
    rows.push({ label: "Mods incompatíveis", value: entry.excludedMods.join(", ") });
  if (Object.keys(entry.unsupportedFields).length > 0) {
    const extras: string[] = [];
    for (const [key, value] of Object.entries(entry.unsupportedFields)) {
      const rendered = describeWeightMultipliers(value);
      if (rendered !== null) {
        extras.push(`Peso bônus: ${rendered}`);
      } else if (value === true) {
        extras.push(humanizeExtraKey(key));
      } else {
        extras.push(`${humanizeExtraKey(key)}: ${formatExtraValue(value)}`);
      }
    }
    rows.push({ label: "Detalhes do modpack", value: extras.join("; ") });
  }
  return rows;
}

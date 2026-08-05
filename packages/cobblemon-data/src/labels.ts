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
      value: condition.biomes.map((biome) => biome.replace(/^minecraft:/, "")).join(", "),
    });
  }
  if (condition.timeRanges.length > 0) {
    summary.push({
      label: "Período",
      value: condition.timeRanges
        .map(
          (time) =>
            TIME_LABELS_PT[time.toUpperCase()] ??
            `Condição especial definida pelo modpack (${time})`,
        )
        .join(", "),
    });
  }
  if (condition.weathers.length > 0) {
    summary.push({
      label: "Clima",
      value: condition.weathers
        .map(
          (weather) =>
            WEATHER_LABELS_PT[weather.toUpperCase()] ??
            `Condição especial definida pelo modpack (${weather})`,
        )
        .join(", "),
    });
  }
  if (condition.moonPhases.length > 0) {
    summary.push({ label: "Fases da lua", value: condition.moonPhases.join(", ") });
  }
  if (condition.skyLight) {
    const parts: string[] = [];
    if (condition.skyLight.minimum !== undefined) parts.push(`mín. ${condition.skyLight.minimum}`);
    if (condition.skyLight.maximum !== undefined) parts.push(`máx. ${condition.skyLight.maximum}`);
    summary.push({ label: "Luz do céu", value: parts.join(", ") });
  }
  if (condition.needsSeeSky === true) {
    summary.push({ label: "Céu visível", value: "sim" });
  }
  if (condition.maxDepth !== undefined || condition.minDepth !== undefined) {
    const parts: string[] = [];
    if (condition.minDepth !== undefined) parts.push(`profundidade mín. ${condition.minDepth}`);
    if (condition.maxDepth !== undefined) parts.push(`profundidade máx. ${condition.maxDepth}`);
    summary.push({ label: "Profundidade", value: parts.join(", ") });
  }
  if (Object.keys(condition.extra).length > 0) {
    summary.push({
      label: "Condições especiais",
      value: "Condição especial definida pelo modpack.",
    });
  }
  return summary;
}

export interface SpawnRenderFlags {
  showUnknown: boolean;
}

export function describeEntryPt(entry: NormalizedSpawnEntry): SpawnConditionSummary[] {
  const rows: SpawnConditionSummary[] = [];
  rows.push({ label: "ID de spawn", value: entry.id });
  if (entry.bucket) rows.push({ label: "Raridade", value: entry.bucket.replace(/[-_]/g, " ") });
  if (entry.weight !== undefined) rows.push({ label: "Peso", value: String(entry.weight) });
  if (entry.level) {
    rows.push({
      label: "Nível",
      value:
        entry.level.minimum !== undefined && entry.level.maximum !== undefined
          ? entry.level.minimum === entry.level.maximum
            ? String(entry.level.minimum)
            : `${entry.level.minimum}–${entry.level.maximum}`
          : (entry.level.raw ?? "Condição especial definida pelo modpack."),
    });
  }
  if (entry.context) rows.push({ label: "Contexto", value: entry.context });
  if (entry.positionType) rows.push({ label: "Posição", value: entry.positionType });
  if (entry.presets.length > 0) rows.push({ label: "Presets", value: entry.presets.join(", ") });
  rows.push(...describeConditionsPt(entry.conditions));
  if (
    entry.anticonditions.biomes.length > 0 ||
    Object.keys(entry.anticonditions.extra).length > 0
  ) {
    const anti = describeConditionsPt(entry.anticonditions);
    if (anti.length > 0) {
      rows.push({
        label: "Excluído quando",
        value: anti.map((row) => `${row.label.toLowerCase()}: ${row.value}`).join("; "),
      });
    }
  }
  if (entry.requiredMods.length > 0)
    rows.push({ label: "Mods necessários", value: entry.requiredMods.join(", ") });
  if (entry.excludedMods.length > 0)
    rows.push({ label: "Mods incompatíveis", value: entry.excludedMods.join(", ") });
  if (Object.keys(entry.unsupportedFields).length > 0) {
    rows.push({ label: "Outros", value: "Condição especial definida pelo modpack." });
  }
  return rows;
}

import {
  escapeMarkdown,
  type SpawnAlertEvent,
  classifySpawnAlertTier,
  roundToRegion,
  formatRegionPt,
  type CoordinatePolicy,
} from "@bigbangcraft/domain";
import { PT_BR } from "../messages/pt-BR.js";

export interface AlertEmbedOptions {
  coordinatePolicy: CoordinatePolicy;
  regionGridSize: number;
  showNearestPlayer: boolean;
  serverAddress: string;
}

export function buildSpawnAlertEmbed(
  event: SpawnAlertEvent,
  options: AlertEmbedOptions,
): {
  title: string;
  description: string;
  color: number;
  footer: { text: string };
  image?: { url: string };
} | null {
  const tier = classifySpawnAlertTier(event);
  const t = PT_BR.spawnAlert;

  let title: string;
  let color: number;
  switch (tier) {
    case "shiny":
      title = t.shinyTitle;
      color = 0xffd700;
      break;
    case "legendary":
      title = t.legendaryTitle;
      color = 0xe74c3c;
      break;
    case "rare":
      title = t.rareTitle;
      color = 0x3498db;
      break;
    default:
      title = t.standardTitle;
      color = 0x95a5a6;
  }

  const lines: string[] = [];
  const displayName = event.displayName ?? event.species ?? "Pokémon desconhecido";
  lines.push(`**${t.fields.pokemon}**: ${escapeMarkdown(displayName)}`);

  if (event.level !== undefined) {
    lines.push(`**${t.fields.level}**: ${event.level}`);
  }

  const rarityTags: string[] = [];
  if (event.shiny) rarityTags.push(PT_BR.pokemon.labels.shiny);
  if (event.legendary) rarityTags.push(PT_BR.pokemon.labels.legendary);
  if (event.mythical) rarityTags.push(PT_BR.pokemon.labels.mythical);
  if (event.ultraBeast) rarityTags.push(PT_BR.pokemon.labels.ultraBeast);
  if (event.paradox) rarityTags.push(PT_BR.pokemon.labels.paradox);
  if (event.hiddenAbility) rarityTags.push(PT_BR.spawnAlert.hiddenAbilityLabel);
  const rarity = event.bucket ?? event.rarity;
  if (rarity) rarityTags.push(escapeMarkdown(rarity.replace(/[-_]/g, " ")));
  if (rarityTags.length > 0) {
    lines.push(`**${t.fields.rarity}**: ${rarityTags.join(" · ")}`);
  }

  if (event.biome) {
    lines.push(`**${t.fields.biome}**: ${escapeMarkdown(event.biome.replace(/^minecraft:/, ""))}`);
  }
  if (event.dimension) {
    lines.push(`**${t.fields.dimension}**: ${escapeMarkdown(event.dimension)}`);
  }

  if (
    (options.coordinatePolicy === "region" || options.coordinatePolicy === "exact_admin_only") &&
    event.coordinates?.x !== undefined &&
    event.coordinates?.z !== undefined
  ) {
    if (options.coordinatePolicy === "exact_admin_only") {
      lines.push(
        `**${t.fields.exactCoordinates}**: \`${Math.round(event.coordinates.x)}, ${Math.round(event.coordinates.z)}\``,
      );
    } else {
      const region = roundToRegion(
        event.coordinates.x,
        event.coordinates.z,
        options.regionGridSize,
      );
      lines.push(`**${t.fields.region}**: ${escapeMarkdown(formatRegionPt(region))}`);
    }
  }

  if (options.showNearestPlayer && event.nearestPlayer) {
    lines.push(`**Jogador mais próximo**: ${escapeMarkdown(event.nearestPlayer)}`);
  }

  lines.push("");
  lines.push(`🌍 ${escapeMarkdown(options.serverAddress)}`);

  let image: { url: string } | undefined;
  if (event.dexNumber && event.dexNumber > 0) {
    image = {
      url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${event.dexNumber}.png`,
    };
  }

  return {
    title,
    description: lines.join("\n"),
    color,
    ...(image ? { image } : {}),
    footer: { text: t.footer },
  };
}

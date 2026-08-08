import {
  escapeMarkdown,
  roundToRegion,
  formatRegionPt,
  type CoordinatePolicy,
  type SpawnLifecycleEvent,
  type SpawnLifecycleStatus,
} from "@bigbangcraft/domain";
import { PT_BR } from "../messages/pt-BR.js";

export interface BbsaEmbedOptions {
  coordinatePolicy: CoordinatePolicy;
  regionGridSize: number;
  showNearestPlayer: boolean;
  serverAddress: string;
  showOrigin: boolean;
  showAlertReasons: boolean;
}

export function buildBbsaLifecycleEmbed(
  event: SpawnLifecycleEvent,
  options: BbsaEmbedOptions,
): {
  title: string;
  description: string;
  color: number;
  footer: { text: string };
  image?: { url: string };
} | null {
  const status: SpawnLifecycleStatus = event.status ?? "SPAWNED";
  let title: string;
  let color: number;

  const displayName = event.displayName ?? event.species ?? "Pokémon";

  switch (status) {
    case "SPAWNED": {
      if (event.shiny) {
        title = PT_BR.spawnAlert.shinyTitle;
        color = 0xffd700;
      } else if (event.legendary || event.mythical || event.ultraBeast || event.paradox) {
        title = PT_BR.spawnAlert.legendaryTitle;
        color = 0xe74c3c;
      } else {
        title = PT_BR.spawnAlert.rareTitle;
        color = 0x3498db;
      }
      break;
    }
    case "IN_BATTLE": {
      title = `⚔️ ${escapeMarkdown(displayName)} ${PT_BR.lifecycle.inBattle}`;
      color = 0xe67e22;
      break;
    }
    case "CAPTURED": {
      title = `🎉 ${escapeMarkdown(displayName)} ${PT_BR.lifecycle.captured}`;
      color = 0x2ecc71;
      break;
    }
    case "DEFEATED": {
      title = `💀 ${escapeMarkdown(displayName)} ${PT_BR.lifecycle.defeated}`;
      color = 0x7f8c8d;
      break;
    }
    case "DESPAWNED": {
      title = `⌛ ${escapeMarkdown(displayName)} ${PT_BR.lifecycle.despawned}`;
      color = 0x95a5a6;
      break;
    }
    case "REMOVED": {
      title = `⚠️ ${escapeMarkdown(displayName)} ${PT_BR.lifecycle.removed}`;
      color = 0x555555;
      break;
    }
    default: {
      title = `📡 ${PT_BR.spawnAlert.standardTitle}`;
      color = 0x95a5a6;
    }
  }

  const lines: string[] = [];

  if (status === "SPAWNED") {
    lines.push(`**${PT_BR.lifecycle.fields.status}**: ${PT_BR.lifecycle.statusLabels.available}`);
  } else if (status === "IN_BATTLE") {
    lines.push(`**${PT_BR.lifecycle.fields.status}**: ${PT_BR.lifecycle.statusLabels.inBattle}`);
  } else if (status === "CAPTURED") {
    lines.push(`**${PT_BR.lifecycle.fields.status}**: ${PT_BR.lifecycle.statusLabels.captured}`);
  } else if (status === "DEFEATED") {
    lines.push(`**${PT_BR.lifecycle.fields.status}**: ${PT_BR.lifecycle.statusLabels.defeated}`);
  } else if (status === "DESPAWNED") {
    lines.push(`**${PT_BR.lifecycle.fields.status}**: ${PT_BR.lifecycle.statusLabels.despawned}`);
  } else if (status === "REMOVED") {
    lines.push(`**${PT_BR.lifecycle.fields.status}**: ${PT_BR.lifecycle.statusLabels.removed}`);
  }

  if (event.level !== undefined) {
    lines.push(`**${PT_BR.spawnAlert.fields.level}**: ${event.level}`);
  }

  if (status === "SPAWNED" || status === "UNKNOWN") {
    const rarityTags: string[] = [];
    if (event.shiny) rarityTags.push(PT_BR.pokemon.labels.shiny);
    if (event.legendary) rarityTags.push(PT_BR.pokemon.labels.legendary);
    if (event.mythical) rarityTags.push(PT_BR.pokemon.labels.mythical);
    if (event.ultraBeast) rarityTags.push(PT_BR.pokemon.labels.ultraBeast);
    if (event.paradox) rarityTags.push(PT_BR.pokemon.labels.paradox);
    const rarity = event.bucket ?? event.rarity;
    if (rarity) rarityTags.push(escapeMarkdown(rarity.replace(/[-_]/g, " ")));
    if (rarityTags.length > 0) {
      lines.push(`**${PT_BR.spawnAlert.fields.rarity}**: ${rarityTags.join(" · ")}`);
    }
  }

  if (event.playerName && event.playerName !== "N/A") {
    if (status === "IN_BATTLE") {
      lines.push(`**${PT_BR.lifecycle.fields.inBattleWith}**: ${escapeMarkdown(event.playerName)}`);
    } else if (status === "CAPTURED") {
      lines.push(`**${PT_BR.lifecycle.fields.capturedBy}**: ${escapeMarkdown(event.playerName)}`);
    } else if (status === "DEFEATED") {
      lines.push(`**${PT_BR.lifecycle.fields.involvedPlayer}**: ${escapeMarkdown(event.playerName)}`);
    }
  }

  if (event.worldDisplayName || event.worldKey) {
    lines.push(`**${PT_BR.lifecycle.fields.world}**: ${escapeMarkdown(event.worldDisplayName ?? event.worldKey ?? "N/A")}`);
  }

  if (event.biome) {
    const cleanBiome = event.biome.replace(/^biome\./, "").replace(/^minecraft:/, "").replace(/^minecraft\./, "");
    lines.push(`**${PT_BR.spawnAlert.fields.biome}**: ${escapeMarkdown(cleanBiome)}`);
  }

  if (
    options.coordinatePolicy !== "hidden" &&
    options.coordinatePolicy === "region" &&
    event.coordinates?.x !== undefined &&
    event.coordinates?.z !== undefined
  ) {
    const region = roundToRegion(event.coordinates.x, event.coordinates.z, options.regionGridSize);
    lines.push(`**${PT_BR.lifecycle.fields.location}**: ${escapeMarkdown(formatRegionPt(region))}`);
  }

  if (options.showOrigin && event.spawnOrigin && event.spawnOrigin !== "UNKNOWN") {
    lines.push(`**${PT_BR.lifecycle.fields.origin}**: ${PT_BR.lifecycle.originLabels[event.spawnOrigin] ?? event.spawnOrigin}`);
  }

  if (options.showAlertReasons && event.alertReasons && event.alertReasons.length > 0) {
    const labels = PT_BR.lifecycle.alertReasonLabels as Record<string, string>;
    const friendly = event.alertReasons.map((r) => labels[r] ?? escapeMarkdown(r));
    lines.push(`**${PT_BR.lifecycle.fields.reasons}**: ${friendly.join(", ")}`);
  }

  if (event.elapsedTime && event.elapsedTime !== "N/A") {
    if (status === "SPAWNED" || status === "IN_BATTLE") {
      lines.push(`🕐 ${PT_BR.lifecycle.fields.elapsedTime}: ${event.elapsedTime}`);
    }
  }

  if (event.resolvedTime && event.resolvedTime !== "N/A" && (status === "CAPTURED" || status === "DEFEATED" || status === "DESPAWNED")) {
    lines.push(`⏱ ${PT_BR.lifecycle.fields.resolvedTime}: ${event.resolvedTime}`);
  }

  lines.push("");
  lines.push(`🌍 ${escapeMarkdown(options.serverAddress)}`);

  let image: { url: string } | undefined;
  if (event.dexNumber && event.dexNumber > 0 && status !== "DESPAWNED" && status !== "REMOVED") {
    image = {
      url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${event.dexNumber}.png`,
    };
  }

  const shortId = event.spawnAlertId ? event.spawnAlertId.slice(0, 8) : "";
  return {
    title,
    description: lines.join("\n"),
    color,
    ...(image ? { image } : {}),
    footer: { text: shortId ? `${PT_BR.spawnAlert.footer} • Alerta ${shortId}` : PT_BR.spawnAlert.footer },
  };
}

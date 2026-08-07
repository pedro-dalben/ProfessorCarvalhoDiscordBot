import type { ChatInputCommandInteraction } from "discord.js";
import type { AppConfig } from "@bigbangcraft/config";
import type { DatabaseClient } from "@bigbangcraft/database";
import {
  findActiveIdentity,
  findJourneyEntriesByLinkId,
  findJourneyEntriesByMinecraftUuid,
  findJourneyStatsByLinkId,
  findJourneyStatsByUuid,
} from "@bigbangcraft/database";
import { escapeMarkdown } from "@bigbangcraft/domain";
import { PT_BR, replyEphemeral, replyError } from "@bigbangcraft/discord-ui";

export interface JourneyCommandDeps {
  config: AppConfig;
  db: DatabaseClient;
}

const ENTRY_TYPE_FILTER: Record<string, string[]> = {
  todos: [],
  capturas: ["capture", "shiny_capture", "legendary_capture", "mythical_capture", "rare_captured", "first_capture", "first_shiny", "first_legendary"],
  shinies: ["shiny_capture", "first_shiny"],
  lendarios: ["legendary_capture", "mythical_capture", "rare_captured", "first_legendary"],
  evolucoes: ["evolution"],
};

export async function handleDiarioCommand(
  interaction: ChatInputCommandInteraction,
  deps: JourneyCommandDeps,
): Promise<void> {
  const link = await findActiveIdentity(deps.db, {
    discordUserId: interaction.user.id,
    serverId: deps.config.BIGMONCRAFT_SERVER_ID,
  });

  if (!link) {
    await replyError(interaction, PT_BR.commands.diario.noIdentity);
    return;
  }

  const tipo = interaction.options.getString("tipo") ?? "todos";
  const entryTypes = ENTRY_TYPE_FILTER[tipo] ?? [];

  const entries = await findJourneyEntriesByLinkId(deps.db, link.id, {
    limit: 10,
    entryTypes: entryTypes.length > 0 ? entryTypes : undefined,
  });

  if (entries.length === 0) {
    await replyEphemeral(interaction, PT_BR.commands.diario.empty);
    return;
  }

  const lines = entries.map((entry) => {
    const time = entry.occurredAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const title = entry.title ?? formatEntryTitle(entry.entryType, entry.metadata as Record<string, unknown>);
    return `\`${time}\` ${title}`;
  });

  await replyEphemeral(interaction, {
    embeds: [
      {
        title: `📖 ${PT_BR.commands.diario.title}`,
        description: lines.join("\n"),
        color: 0x2ecc71,
        footer: { text: `${deps.config.BIGMONCRAFT_SERVER_NAME} • Professor Carvalho` },
      },
    ],
  });
}

export async function handleEstatisticasCommand(
  interaction: ChatInputCommandInteraction,
  deps: JourneyCommandDeps,
): Promise<void> {
  const link = await findActiveIdentity(deps.db, {
    discordUserId: interaction.user.id,
    serverId: deps.config.BIGMONCRAFT_SERVER_ID,
  });

  if (!link) {
    await replyError(interaction, PT_BR.commands.estatisticas.noIdentity);
    return;
  }

  const stats = await findJourneyStatsByLinkId(deps.db, link.id);

  if (!stats) {
    await replyEphemeral(interaction, PT_BR.commands.estatisticas.empty);
    return;
  }

  const labels = PT_BR.commands.estatisticas.labels;
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  if (stats.totalCaptures > 0)
    fields.push({ name: `🔴 ${labels.captures}`, value: stats.totalCaptures.toLocaleString("pt-BR"), inline: true });
  if (stats.uniqueSpeciesCaptured > 0)
    fields.push({ name: `📖 ${labels.uniqueSpecies}`, value: stats.uniqueSpeciesCaptured.toLocaleString("pt-BR"), inline: true });
  if (stats.shinyCaptures > 0)
    fields.push({ name: `✨ ${labels.shinies}`, value: stats.shinyCaptures.toLocaleString("pt-BR"), inline: true });
  if (stats.legendaryCaptures > 0)
    fields.push({ name: `👑 ${labels.legendaries}`, value: stats.legendaryCaptures.toLocaleString("pt-BR"), inline: true });
  if (stats.mythicalCaptures > 0)
    fields.push({ name: `🌟 ${labels.mythicals}`, value: stats.mythicalCaptures.toLocaleString("pt-BR"), inline: true });

  if (stats.rareEncounters > 0)
    fields.push({ name: `🔬 ${labels.rareEncounters}`, value: stats.rareEncounters.toLocaleString("pt-BR"), inline: true });
  if (stats.rareCaptures > 0)
    fields.push({ name: `✅ ${labels.rareCaptured}`, value: stats.rareCaptures.toLocaleString("pt-BR"), inline: true });
  if (stats.rareDefeated > 0)
    fields.push({ name: `💥 ${labels.rareDefeated}`, value: stats.rareDefeated.toLocaleString("pt-BR"), inline: true });
  if (stats.rareDespawned > 0)
    fields.push({ name: `💨 ${labels.rareDespawned}`, value: stats.rareDespawned.toLocaleString("pt-BR"), inline: true });

  if (stats.evolutions > 0)
    fields.push({ name: `🧬 ${labels.evolutions}`, value: stats.evolutions.toLocaleString("pt-BR"), inline: true });

  if (stats.totalPlaytime > 0)
    fields.push({ name: `🕒 ${labels.playtime}`, value: formatDuration(stats.totalPlaytime), inline: true });

  if (stats.fastestRareCaptureSeconds !== null && stats.fastestRareCaptureSeconds > 0)
    fields.push({ name: `⚡ ${labels.fastestRareCapture}`, value: `${stats.fastestRareCaptureSeconds}s`, inline: true });

  const rareCaptured = stats.rareCaptureCount;
  const rareEncounters = stats.rareEncounters || (stats.rareCaptures + stats.rareDefeated + stats.rareDespawned);
  if (rareEncounters > 0 && rareCaptured > 0) {
    const rate = Math.round((rareCaptured / rareEncounters) * 100);
    fields.push({ name: `🎯 ${labels.captureRateRare}`, value: `${rate}%`, inline: true });
  }

  if (fields.length === 0) {
    await replyEphemeral(interaction, PT_BR.commands.estatisticas.empty);
    return;
  }

  await replyEphemeral(interaction, {
    embeds: [
      {
        title: `📊 ${PT_BR.commands.estatisticas.title}`,
        color: 0x3498db,
        fields,
        footer: { text: `${deps.config.BIGMONCRAFT_SERVER_NAME} • Professor Carvalho` },
      },
    ],
  });
}

function formatEntryTitle(entryType: string, metadata: Record<string, unknown>): string {
  const species = typeof metadata.species === "string" ? metadata.species : "Pokémon";
  const templates: Record<string, string> = {
    capture: `🔴 Capturou ${species}`,
    shiny_capture: `✨ Capturou ${species} Shiny`,
    legendary_capture: `👑 Capturou ${species}`,
    mythical_capture: `🌟 Capturou ${species}`,
    evolution: `🧬 ${metadata.fromSpecies ?? "?"} evoluiu para ${metadata.toSpecies ?? "?"}`,
    first_capture: `🔴 Primeira captura: ${species}`,
    first_shiny: `✨ Primeiro shiny: ${species}`,
    first_legendary: `👑 Primeiro lendário: ${species}`,
    pokedex_milestone: `📖 Pokédex: ${metadata.milestone ?? "?"} espécies`,
    rare_encountered: `🔬 Encontrou ${species}`,
    rare_captured: `✅ Capturou ${species}`,
    rare_defeated: `💥 Derrotou ${species}`,
    rare_despawned: `💨 ${species} desapareceu`,
  };
  return templates[entryType] ?? `${entryType}: ${species}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}min`;
}

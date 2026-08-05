import {
  calculateEffectiveness,
  groupByMultiplier,
  escapeMarkdown,
  type PokemonType,
} from "@bigbangcraft/domain";
import { typeLabelPt } from "@bigbangcraft/domain";
import type { PokemonProvider } from "@bigbangcraft/pokemon-data";
import type { ChatInputCommandInteraction, APIEmbedField } from "discord.js";
import { PT_BR } from "../messages/pt-BR.js";
import { replySuccess, replyError, replyUnavailable } from "../replies.js";

export async function handleFraquezasCommand(
  interaction: ChatInputCommandInteraction,
  provider: PokemonProvider,
): Promise<void> {
  const query = interaction.options.getString("pokemon", true).trim();
  if (!query) {
    await replyError(interaction, PT_BR.commands.dex.notFound);
    return;
  }

  let details;
  try {
    details = await provider.findPokemon(query);
  } catch {
    await replyUnavailable(interaction);
    return;
  }
  if (!details) {
    await replyError(interaction, PT_BR.commands.dex.notFound);
    return;
  }

  const embed = buildFraquezasEmbed(details.displayName, details.types);
  await replySuccess(interaction, { embeds: [embed] });
}

export function buildFraquezasEmbed(
  pokemonName: string,
  types: readonly PokemonType[],
): {
  title: string;
  description: string;
  color: number;
  fields: APIEmbedField[];
  footer: { text: string };
} {
  const t = PT_BR.commands.fraquezas;
  const groups = PT_BR.commands.fraquezas.groups;
  const infos = calculateEffectiveness(types);
  const result = groupByMultiplier(infos);

  const descriptions: string[] = [];
  descriptions.push(
    `**${t.subtitle} ${escapeMarkdown(pokemonName)}** (${types.map(typeLabelPt).join(" / ")})`,
    "",
  );

  const order: Array<{ key: 4 | 2 | 1 | 0.5 | 0.25 | 0; label: string }> = [
    { key: 4, label: groups[4] },
    { key: 2, label: groups[2] },
    { key: 1, label: groups[1] },
    { key: 0.5, label: groups[0.5] },
    { key: 0.25, label: groups[0.25] },
    { key: 0, label: groups[0] },
  ];

  const fields: APIEmbedField[] = [];
  for (const { key, label } of order) {
    const typeNames = result.multipliers[key];
    if (typeNames.length === 0) continue;
    const ptNames = typeNames.map(typeLabelPt).sort();
    fields.push({
      name: label,
      value: ptNames.join(", ") || "—",
      inline: false,
    });
  }

  return {
    title: t.title,
    description: descriptions.join("\n"),
    color: 0xe74c3c,
    fields,
    footer: { text: PT_BR.commands.dex.footer },
  };
}

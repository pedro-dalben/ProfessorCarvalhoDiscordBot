import type { PokemonDetails, PokemonProvider } from "@bigbangcraft/pokemon-data";
import { typeLabelPt, escapeMarkdown } from "@bigbangcraft/domain";
import type { ChatInputCommandInteraction, APIEmbedField } from "discord.js";
import { PT_BR } from "../messages/pt-BR.js";
import { replySuccess, replyError, replyUnavailable } from "../replies.js";

export async function handleDexCommand(
  interaction: ChatInputCommandInteraction,
  provider: PokemonProvider,
): Promise<void> {
  const query = interaction.options.getString("pokemon", true).trim();
  if (!query) {
    await replyError(interaction, PT_BR.commands.dex.notFound);
    return;
  }

  let details: PokemonDetails | null;
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

  const embed = buildDexEmbed(details);
  await replySuccess(interaction, { embeds: [embed] });
}

export function buildDexEmbed(details: PokemonDetails): {
  title: string;
  description: string;
  color: number;
  thumbnail?: { url: string };
  image?: { url: string };
  fields: APIEmbedField[];
  footer: { text: string };
} {
  const label = PT_BR.pokemon.labels;
  const command = PT_BR.commands.dex;
  const types = details.types.map(typeLabelPt).join(" / ");
  const description = [
    `**#${details.dexNumber}** ${escapeMarkdown(details.displayName)}`,
    details.namePtBr ? `(*${escapeMarkdown(details.namePtBr)}*)` : "",
    "",
    `**${label.types}**: ${types}`,
  ]
    .filter(Boolean)
    .join("\n");

  const hiddenAbilities = details.abilities.filter((ability) => ability.hidden);
  const regularAbilities = details.abilities.filter((ability) => !ability.hidden);

  const fields: APIEmbedField[] = [
    {
      name: label.abilities,
      value:
        regularAbilities.map((ability) => escapeMarkdown(ability.displayName)).join("\n") || "—",
      inline: true,
    },
    {
      name: label.hiddenAbility,
      value:
        hiddenAbilities.map((ability) => escapeMarkdown(ability.displayName)).join("\n") || "—",
      inline: true,
    },
    {
      name: "\u200b",
      value: "\u200b",
      inline: true,
    },
    {
      name: label.baseStats,
      value: `**${label.hp}**: ${details.baseStats.hp} | **${label.attack}**: ${details.baseStats.attack} | **${label.defense}**: ${details.baseStats.defense}\n**${label.specialAttack}**: ${details.baseStats.specialAttack} | **${label.specialDefense}**: ${details.baseStats.specialDefense} | **${label.speed}**: ${details.baseStats.speed}`,
      inline: false,
    },
    {
      name: label.height,
      value: `${details.heightM.toFixed(1)} m`,
      inline: true,
    },
    {
      name: label.weight,
      value: `${details.weightKg.toFixed(1)} kg`,
      inline: true,
    },
    {
      name: label.captureRate,
      value: details.captureRate !== undefined ? String(details.captureRate) : "—",
      inline: true,
    },
  ];

  if (details.evolutionSummary.length > 0) {
    const evo = details.evolutionSummary
      .map((stage) => escapeMarkdown(stage.displayName))
      .join(` ${PT_BR.pokemon.evolutionSeparator} `);
    fields.push({
      name: label.evolution,
      value: evo,
      inline: false,
    });
  }

  if (details.flavorText) {
    fields.push({
      name: "📖",
      value: escapeMarkdown(details.flavorText),
      inline: false,
    });
  }

  const extraTags: string[] = [];
  if (details.isLegendary) extraTags.push(label.legendary);
  if (details.isMythical) extraTags.push(label.mythical);
  if (extraTags.length > 0) {
    fields.push({ name: "🏷️", value: extraTags.join(" / "), inline: false });
  }

  const sprite = details.spriteUrl;

  return {
    title: command.title,
    description,
    color: 0x1abc9c,
    ...(sprite ? { thumbnail: { url: sprite } } : {}),
    fields,
    footer: { text: command.footer },
  };
}

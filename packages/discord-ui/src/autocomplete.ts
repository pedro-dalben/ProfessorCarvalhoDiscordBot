import type { AutocompleteRanker } from "@bigbangcraft/pokemon-data";
import type { AutocompleteInteraction } from "discord.js";

export async function handlePokemonAutocomplete(
  interaction: AutocompleteInteraction,
  ranker: AutocompleteRanker,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "pokemon") return;

  const query = focused.value.trim();
  if (!query) {
    await interaction.respond([]);
    return;
  }

  const results = ranker.search(query, 25);
  const choices = results.map((result) => ({
    name: `${result.entry.displayName} (#${result.entry.dex})`,
    value: result.entry.name,
  }));
  await interaction.respond(choices);
}

import { escapeMarkdown, normalizeName } from "@bigbangcraft/domain";
import type { SpawnSnapshot, NormalizedSpawnEntry } from "@bigbangcraft/cobblemon-data";
import { describeEntryPt, humanizeRarityPt } from "@bigbangcraft/cobblemon-data";
import type { PokemonProvider } from "@bigbangcraft/pokemon-data";
import type { ChatInputCommandInteraction, APIEmbedField } from "discord.js";
import { PT_BR } from "../messages/pt-BR.js";
import { replySuccess, replyError } from "../replies.js";

export interface SpawnSnapshotAccess {
  getSnapshot(): SpawnSnapshot | null;
}

/** Compara nomes ignorando hífens/espaços (ex.: "Ho-Oh" == "hooh", "Wo-Chien" == "wochien"). */
function looseSpeciesKey(value: string): string {
  return value.toLowerCase().replace(/[-_ ]+/g, "");
}

export async function handleSpawnCommand(
  interaction: ChatInputCommandInteraction,
  snapshotAccess: SpawnSnapshotAccess,
  provider?: PokemonProvider,
): Promise<void> {
  const query = interaction.options.getString("pokemon", true).trim();
  if (!query) {
    await replyError(interaction, PT_BR.commands.spawn.notFound);
    return;
  }

  const snapshot = snapshotAccess.getSnapshot();
  if (!snapshot) {
    await replyError(interaction, PT_BR.commands.spawn.snapshotUnavailable);
    return;
  }

  const normalized = normalizeName(query);
  const queryKey = looseSpeciesKey(normalized);
  const entries = snapshot.entries.filter((entry) => looseSpeciesKey(entry.pokemon) === queryKey);

  if (entries.length === 0) {
    await replyError(interaction, PT_BR.commands.spawn.notFound);
    return;
  }

  let spriteUrl: string | undefined;
  if (provider) {
    try {
      const details = await provider.findPokemon(entries[0]!.pokemon);
      spriteUrl = details?.spriteUrl;
    } catch {
      spriteUrl = undefined;
    }
  }

  const grouped = groupSpawnEntries(entries);
  const embed = buildSpawnEmbed(grouped, snapshot, spriteUrl);
  await replySuccess(interaction, { embeds: [embed] });
}

/**
 * Agrupa entradas que diferem apenas em id/biomas/origem (mesma espécie e
 * mesmas condições), mesclando os biomas — evita campos repetidos quase idênticos.
 */
export function groupSpawnEntries(
  entries: readonly NormalizedSpawnEntry[],
): NormalizedSpawnEntry[] {
  const groups = new Map<string, NormalizedSpawnEntry[]>();
  for (const entry of entries) {
    const key = JSON.stringify({
      ...entry,
      id: undefined,
      source: undefined,
      conditions: { ...entry.conditions, biomes: undefined },
      anticonditions: { ...entry.anticonditions, biomes: undefined },
    });
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }
  return [...groups.values()].map(mergeGroupForDisplay);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function mergeGroupForDisplay(group: NormalizedSpawnEntry[]): NormalizedSpawnEntry {
  const base = structuredClone(group[0]!);
  const mergedBiomes = unique(group.flatMap((entry) => entry.conditions.biomes ?? []));
  base.conditions.biomes = mergedBiomes;
  const mergedAntiBiomes = unique(group.flatMap((entry) => entry.anticonditions?.biomes ?? []));
  base.anticonditions.biomes = mergedAntiBiomes;
  return base;
}

function speciesDisplayName(entry: NormalizedSpawnEntry): string {
  const base = entry.form ? `${entry.pokemon} ${entry.form}` : entry.pokemon;
  return base
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

export function buildSpawnEmbed(
  entries: readonly NormalizedSpawnEntry[],
  snapshot: SpawnSnapshot,
  spriteUrl?: string,
): {
  title: string;
  color: number;
  fields: APIEmbedField[];
  footer: { text: string };
  thumbnail?: { url: string };
} {
  const t = PT_BR.commands.spawn;

  const fields: APIEmbedField[] = [];

  for (const entry of entries.slice(0, 10)) {
    const rarity = entry.bucket ? ` (${humanizeRarityPt(entry.bucket)})` : "";
    const name = `${escapeMarkdown(speciesDisplayName(entry))}${rarity}`;
    const rows = describeEntryPt(entry).filter((row) => row.label !== "Raridade");
    const value = rows
      .map((row) => `**${row.label}**: ${escapeMarkdown(row.value)}`)
      .join("\n")
      .slice(0, 1024);
    fields.push({
      name: name.slice(0, 256),
      value: value || t.footer,
      inline: false,
    });
  }

  const footerParts: string[] = [t.footer];
  if (snapshot.generatedAt) {
    footerParts.push(
      `${t.manifestFooter} ${new Date(snapshot.generatedAt).toLocaleDateString("pt-BR")}`,
    );
  }

  return {
    title: `${t.title} ${escapeMarkdown(speciesDisplayName(entries[0]!))}`,
    color: 0x2ecc71,
    fields,
    footer: { text: footerParts.join(" • ") },
    ...(spriteUrl ? { thumbnail: { url: spriteUrl } } : {}),
  };
}

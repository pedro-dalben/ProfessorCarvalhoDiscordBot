import { escapeMarkdown, normalizeName } from "@bigbangcraft/domain";
import type { SpawnSnapshot, NormalizedSpawnEntry } from "@bigbangcraft/cobblemon-data";
import { describeEntryPt } from "@bigbangcraft/cobblemon-data";
import type { ChatInputCommandInteraction, APIEmbedField } from "discord.js";
import { PT_BR } from "../messages/pt-BR.js";
import { replySuccess, replyError } from "../replies.js";

export interface SpawnSnapshotAccess {
  getSnapshot(): SpawnSnapshot | null;
}

export async function handleSpawnCommand(
  interaction: ChatInputCommandInteraction,
  snapshotAccess: SpawnSnapshotAccess,
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
  const entries = snapshot.entries.filter((entry) => entry.pokemon === normalized);

  if (entries.length === 0) {
    await replyError(interaction, PT_BR.commands.spawn.notFound);
    return;
  }

  const slicedEntries = entries.slice(0, 10);
  const embed = buildSpawnEmbed(slicedEntries, snapshot);
  await replySuccess(interaction, { embeds: [embed] });
}

export function buildSpawnEmbed(
  entries: readonly NormalizedSpawnEntry[],
  snapshot: SpawnSnapshot,
): { title: string; color: number; fields: APIEmbedField[]; footer: { text: string } } {
  const t = PT_BR.commands.spawn;

  const fields: APIEmbedField[] = [];

  for (const entry of entries) {
    const rows = describeEntryPt(entry);
    const label = rows.find((row) => row.label.toLowerCase() === "raridade")?.value ?? "";
    const fieldName = `${escapeMarkdown(entry.pokemon)} ${label ? `(${escapeMarkdown(label)})` : ""} [${escapeMarkdown(entry.id)}]`;
    const value = rows.map((row) => `**${row.label}**: ${escapeMarkdown(row.value)}`).join("\n");
    fields.push({
      name: fieldName,
      value: value.slice(0, 1024),
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
    title: `${t.title} ${escapeMarkdown(
      entries[0]?.form ? `${entries[0].pokemon}-${entries[0].form}` : (entries[0]?.pokemon ?? "?"),
    )}`,
    color: 0x2ecc71,
    fields,
    footer: { text: footerParts.join(" • ") },
  };
}

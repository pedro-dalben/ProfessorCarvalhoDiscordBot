import { escapeMarkdown } from "@bigbangcraft/domain";
import type { ChatInputCommandInteraction, APIEmbedField } from "discord.js";
import { PT_BR } from "../messages/pt-BR.js";
import { replySuccess } from "../replies.js";

export interface StatusContext {
  discordReady: boolean;
  databaseReachable: boolean;
  redisReachable: boolean;
  workerHeartbeatAgeSeconds: number | null;
  pokemonCacheEntries: number;
  spawnSnapshotLoaded: boolean;
  spawnSnapshotGeneratedAt: string | null;
  spawnSnapshotAgeSeconds: number | null;
  spawnSnapshotEntryCount: number | null;
  csaMode: string;
  queueSummary: { queue: string; waiting: number; active: number; failed: number }[];
  appVersion: string;
}

export async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  context: StatusContext,
): Promise<void> {
  const t = PT_BR.commands.status;

  const fields: APIEmbedField[] = [
    {
      name: t.labels.bot,
      value: context.discordReady ? `🟢 ${t.online}` : `🔴 ${t.offline}`,
      inline: true,
    },
    {
      name: t.labels.database,
      value: context.databaseReachable ? `🟢 ${t.online}` : `🔴 ${t.offline}`,
      inline: true,
    },
    {
      name: t.labels.redis,
      value: context.redisReachable ? `🟢 ${t.online}` : `🔴 ${t.offline}`,
      inline: true,
    },
    {
      name: t.labels.workerHeartbeat,
      value:
        context.workerHeartbeatAgeSeconds !== null
          ? `${context.workerHeartbeatAgeSeconds <= 60 ? "🟢" : "🟡"} ${escapeMarkdown(String(context.workerHeartbeatAgeSeconds))}s atrás`
          : `🔴 ${t.notLoaded}`,
      inline: true,
    },
    {
      name: t.labels.pokemonCache,
      value: escapeMarkdown(`${context.pokemonCacheEntries} entradas`),
      inline: true,
    },
    {
      name: t.labels.spawnSnapshot,
      value: context.spawnSnapshotLoaded
        ? `🟢 ${context.spawnSnapshotEntryCount ?? 0} spawns`
        : `🔴 ${t.notLoaded}`,
      inline: true,
    },
  ];

  if (context.spawnSnapshotLoaded && context.spawnSnapshotGeneratedAt) {
    fields.push({
      name: t.labels.spawnSnapshotGenerated,
      value: escapeMarkdown(new Date(context.spawnSnapshotGeneratedAt).toLocaleString("pt-BR")),
      inline: true,
    });
    if (context.spawnSnapshotAgeSeconds !== null) {
      fields.push({
        name: t.labels.spawnSnapshotAge,
        value: escapeMarkdown(formatDuration(context.spawnSnapshotAgeSeconds)),
        inline: true,
      });
    }
  }

  fields.push({
    name: t.labels.csaMode,
    value: escapeMarkdown(context.csaMode),
    inline: true,
  });

  if (context.queueSummary.length > 0) {
    const queueText = context.queueSummary
      .map(
        (queue) =>
          `${escapeMarkdown(queue.queue)}: ${queue.waiting} aguardando, ${queue.active} ativos, ${queue.failed} falhos`,
      )
      .join("\n");
    fields.push({ name: t.labels.queueStatus, value: queueText, inline: false });
  }

  fields.push({ name: t.labels.version, value: escapeMarkdown(context.appVersion), inline: true });

  await replySuccess(interaction, {
    embeds: [
      {
        title: t.title,
        color: context.discordReady && context.databaseReachable ? 0x2ecc71 : 0xe74c3c,
        fields,
        footer: { text: `Professor Carvalho • ${context.appVersion}` },
      },
    ],
  });
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min`;
  return `${totalSeconds}s`;
}

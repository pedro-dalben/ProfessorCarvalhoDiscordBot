import { escapeMarkdown } from "@bigbangcraft/domain";
import type { ChatInputCommandInteraction } from "discord.js";
import { PT_BR } from "../messages/pt-BR.js";
import { replySuccess } from "../replies.js";

export interface HelpContext {
  serverAddress: string;
  siteUrl?: string;
  snapshotDate?: Date;
}

export async function handleAjudaCommand(
  interaction: ChatInputCommandInteraction,
  context: HelpContext,
): Promise<void> {
  const t = PT_BR.commands.ajuda;

  const commandsList = t.commandList
    .map((cmd) => `**${escapeMarkdown(cmd.name)}** — ${escapeMarkdown(cmd.value)}`)
    .join("\n\n");

  const footerLines: string[] = [];
  footerLines.push(
    `${escapeMarkdown(t.serverAddress.replace("{address}", context.serverAddress))}`,
  );
  if (context.siteUrl) {
    footerLines.push(`${escapeMarkdown(t.siteLabel.replace("{url}", context.siteUrl))}`);
  }
  if (context.snapshotDate) {
    footerLines.push(
      escapeMarkdown(
        t.dataFreshness.replace("{date}", context.snapshotDate.toLocaleDateString("pt-BR")),
      ),
    );
  }

  const description = [t.descriptionPrefix, "", commandsList, "", `📝 ${t.privacyNote}`].join("\n");

  await replySuccess(interaction, {
    embeds: [
      {
        title: t.title,
        description,
        color: 0x3498db,
        footer: { text: footerLines.join("\n") },
      },
    ],
  });
}

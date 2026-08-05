import { escapeMarkdown, generateCorrelationCode } from "@bigbangcraft/domain";
import type {
  ChatInputCommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
} from "discord.js";
import { PT_BR } from "./messages/pt-BR.js";

type ReplyContent = string | InteractionReplyOptions;

function safePayload(content: ReplyContent): InteractionReplyOptions {
  if (typeof content === "string") {
    return { content, allowedMentions: { parse: [] } };
  }
  return { ...content, allowedMentions: { parse: [] } };
}

function safePayloadEdit(content: ReplyContent): InteractionEditReplyOptions {
  if (typeof content === "string") {
    return { content, allowedMentions: { parse: [] } };
  }
  const { flags: _flags, ...rest } = content;
  return { ...rest, allowedMentions: { parse: [] } };
}

export async function replySuccess(
  interaction: ChatInputCommandInteraction,
  content: ReplyContent,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(safePayloadEdit(content));
  } else {
    await interaction.reply(safePayload(content));
  }
}

export async function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: ReplyContent,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(safePayloadEdit(content));
  } else {
    const payload = safePayload(content);
    payload.flags = payload.flags ?? "Ephemeral";
    await interaction.reply(payload);
  }
}

export async function replyError(
  interaction: ChatInputCommandInteraction,
  message: string,
  correlationCode?: string,
): Promise<void> {
  const code = correlationCode ?? generateCorrelationCode();
  const text = message.replace("{code}", code);
  await replyEphemeral(interaction, {
    content: `❌ ${escapeMarkdown(text)}`,
  });
}

export async function replyUnavailable(interaction: ChatInputCommandInteraction): Promise<void> {
  await replyError(interaction, PT_BR.errors.providerUnavailable);
}

export async function replyPermissionDenied(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await replyError(interaction, PT_BR.errors.permissionDenied);
}

export async function editDeferredReply(
  interaction: ChatInputCommandInteraction,
  content: ReplyContent,
): Promise<void> {
  await interaction.editReply(safePayloadEdit(content));
}

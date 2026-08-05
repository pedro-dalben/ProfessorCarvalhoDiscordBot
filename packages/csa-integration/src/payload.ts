import { z } from "zod";

export const csaEmbedFieldSchema = z.object({
  name: z.string().max(256).optional(),
  value: z.string().max(1024).optional(),
  inline: z.boolean().optional(),
});

export const csaEmbedSchema = z
  .object({
    title: z.string().max(256).optional(),
    description: z.string().max(4096).optional(),
    url: z.string().optional(),
    color: z.string().optional(),
    timestamp: z.string().optional(),
    thumbnailURL: z.string().optional(),
    imageUrl: z.string().optional(),
    author: z
      .object({
        name: z.string().optional(),
        url: z.string().optional(),
        iconURL: z.string().optional(),
      })
      .optional(),
    fields: z.array(csaEmbedFieldSchema).optional(),
    footer: z
      .object({
        text: z.string().optional(),
        iconURL: z.string().optional(),
      })
      .optional(),
  })
  .catchall(z.unknown());

export const csaWebhookPayloadSchema = z
  .object({
    content: z.string().max(2000).optional(),
    username: z.string().max(80).optional(),
    avatar_url: z.string().optional(),
    avatarURL: z.string().optional(),
    tts: z.boolean().optional(),
    embeds: z.array(csaEmbedSchema).max(10).optional(),
  })
  .catchall(z.unknown());

export type CsaWebhookPayload = z.infer<typeof csaWebhookPayloadSchema>;
export type CsaEmbed = z.infer<typeof csaEmbedSchema>;

export function validateCsaPayload(
  raw: unknown,
):
  | { ok: true; payload: CsaWebhookPayload }
  | { ok: false; code: "INVALID_CSA_PAYLOAD"; message: string } {
  const parsed = csaWebhookPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_CSA_PAYLOAD",
      message: "A notificação recebida não possui um formato válido.",
    };
  }
  const payload = parsed.data;
  const hasContent = typeof payload.content === "string" && payload.content.trim().length > 0;
  const hasEmbeds = Array.isArray(payload.embeds) && payload.embeds.length > 0;
  if (!hasContent && !hasEmbeds) {
    return {
      ok: false,
      code: "INVALID_CSA_PAYLOAD",
      message: "A notificação recebida está vazia.",
    };
  }
  return { ok: true, payload };
}

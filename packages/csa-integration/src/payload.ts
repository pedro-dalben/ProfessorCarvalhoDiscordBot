import { z } from "zod";

/**
 * Schema do payload JSON produzido pelo CSA 1.13.2.
 *
 * O JAR serializa o modelo `com.n1netails.n1netails.discord.model.WebhookMessage`
 * com Jackson (campos em snake_case estilo Discord):
 *
 *   { content, username, avatar_url, tts, embeds[] }
 *
 * Cada embed possui: title, description, url, color, author{name,url,icon_url},
 * fields[{name,value,inline}], footer{text,icon_url}, image{url},
 * thumbnail{url}, timestamp (ISO-8601 gerado por Instant.now() quando habilitado).
 *
 * As chaves camelCase (`avatarURL`, `imageURL`, `thumbnailURL`, `iconURL`)
 * existem apenas no arquivo de CONFIGURAÇÃO do CSA (`webhooks.json`); o
 * payload HTTP enviado usa as chaves snake_case do modelo serializado.
 */
export const csaEmbedFieldSchema = z.object({
  name: z.string().max(256).optional(),
  value: z.string().max(1024).optional(),
  inline: z.boolean().optional(),
});

const csaEmbedImageSchema = z.object({
  url: z.string().optional(),
});

export const csaEmbedSchema = z
  .object({
    title: z.string().max(256).optional(),
    description: z.string().max(4096).optional(),
    url: z.string().optional(),
    color: z.string().optional(),
    timestamp: z.string().optional(),
    thumbnail: csaEmbedImageSchema.optional(),
    image: csaEmbedImageSchema.optional(),
    author: z
      .object({
        name: z.string().optional(),
        url: z.string().optional(),
        icon_url: z.string().optional(),
      })
      .optional(),
    fields: z.array(csaEmbedFieldSchema).max(25).optional(),
    footer: z
      .object({
        text: z.string().optional(),
        icon_url: z.string().optional(),
      })
      .optional(),
  })
  .catchall(z.unknown());

export const csaWebhookPayloadSchema = z
  .object({
    content: z.string().max(2000).optional(),
    username: z.string().max(80).optional(),
    avatar_url: z.string().optional(),
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

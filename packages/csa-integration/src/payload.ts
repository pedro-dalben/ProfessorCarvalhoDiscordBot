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

const nullableString = z.union([z.string(), z.null()]).optional();

const csaEmbedImageSchema = z.object({
  url: nullableString,
});

export const csaEmbedSchema = z
  .object({
    title: z.string().max(256).nullable().optional(),
    description: z.string().max(4096).nullable().optional(),
    url: nullableString,
    color: z.union([z.string(), z.number()]).nullable().optional(),
    timestamp: z.union([z.string(), z.boolean()]).nullable().optional(),
    thumbnail: csaEmbedImageSchema.nullable().optional(),
    image: csaEmbedImageSchema.nullable().optional(),
    author: z
      .object({
        name: z.string().nullable().optional(),
        url: nullableString,
        icon_url: nullableString,
      })
      .nullable()
      .optional(),
    fields: z.array(csaEmbedFieldSchema).max(25).nullable().optional(),
    footer: z
      .object({
        text: z.string().nullable().optional(),
        icon_url: nullableString,
      })
      .nullable()
      .optional(),
  })
  .catchall(z.unknown());

export const csaWebhookPayloadSchema = z
  .object({
    content: z.string().max(2000).nullable().optional(),
    username: z.string().max(80).nullable().optional(),
    avatar_url: nullableString,
    tts: z.boolean().nullable().optional(),
    embeds: z.array(csaEmbedSchema).max(10).nullable().optional(),
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

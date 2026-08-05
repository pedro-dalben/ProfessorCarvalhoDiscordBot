export const EMBED_TITLE_MAX = 256;
export const EMBED_DESCRIPTION_MAX = 4096;
export const EMBED_FIELD_NAME_MAX = 256;
export const EMBED_FIELD_VALUE_MAX = 1024;
export const EMBED_FOOTER_MAX = 2048;
export const EMBED_AUTHOR_NAME_MAX = 256;
export const EMBED_FIELD_COUNT_MAX = 25;
export const EMBED_TOTAL_MAX = 6000;

export interface EmbedLimitsViolation {
  field: string;
  value: number;
  max: number;
}

export function checkEmbedTextLimits(embed: {
  title?: string;
  description?: string;
  footer?: string;
  authorName?: string;
  fields?: Array<{ name: string; value: string }>;
}): EmbedLimitsViolation[] {
  const violations: EmbedLimitsViolation[] = [];
  const pushIf = (field: string, value: number, max: number): void => {
    if (value > max) violations.push({ field, value, max });
  };
  pushIf("title", embed.title?.length ?? 0, EMBED_TITLE_MAX);
  pushIf("description", embed.description?.length ?? 0, EMBED_DESCRIPTION_MAX);
  pushIf("footer", embed.footer?.length ?? 0, EMBED_FOOTER_MAX);
  pushIf("authorName", embed.authorName?.length ?? 0, EMBED_AUTHOR_NAME_MAX);
  const fields = embed.fields ?? [];
  pushIf("fields.length", fields.length, EMBED_FIELD_COUNT_MAX);
  fields.forEach((field, index) => {
    pushIf(`fields[${index}].name`, field.name.length, EMBED_FIELD_NAME_MAX);
    pushIf(`fields[${index}].value`, field.value.length, EMBED_FIELD_VALUE_MAX);
  });
  return violations;
}

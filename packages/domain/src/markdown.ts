export const MARKDOWN_SPECIAL_CHARS = /[\\*_~`|>]/g;

export function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIAL_CHARS, (char) => `\\${char}`).replace(/@/g, "@\u200b");
}

export function truncateByCodePoints(text: string, maxLength: number): string {
  const codePoints = Array.from(text);
  if (codePoints.length <= maxLength) return text;
  const truncated = codePoints.slice(0, Math.max(0, maxLength - 1));
  return `${truncated.join("")}…`;
}

export function sanitizeForDiscord(text: string, maxLength = 1024): string {
  return truncateByCodePoints(escapeMarkdown(text), maxLength);
}

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function normalizeLinkCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidLinkCode(value: string): boolean {
  return /^CARVALHO-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/.test(normalizeLinkCode(value));
}

export function generateLinkCode(): string {
  const bytes = randomBytes(8);
  let suffix = "";
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length];
  return `CARVALHO-${suffix}`;
}

export function hashLinkCode(code: string, pepper: string): string {
  return createHmac("sha256", Buffer.from(pepper, "utf8"))
    .update(normalizeLinkCode(code), "utf8")
    .digest("hex");
}

export function verifyHmac(expectedHex: string, receivedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(receivedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function fingerprintFromFields(fields: Record<string, unknown>): string {
  return sha256Hex(stableStringify(fields));
}

const CORRELATION_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateCorrelationCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) {
    code += CORRELATION_ALPHABET[byte % CORRELATION_ALPHABET.length];
  }
  return `PC-${code}`;
}

export function safeTokenCompare(expected: string, received: string): boolean {
  const bufferExpected = Buffer.from(expected, "utf8");
  const bufferReceived = Buffer.from(received, "utf8");
  const bufferDummy = Buffer.alloc(bufferExpected.length);
  if (bufferReceived.length !== bufferExpected.length) {
    const sameLengthAsExpected = Buffer.concat([bufferReceived, bufferDummy]).subarray(
      0,
      bufferExpected.length,
    );
    timingSafeEqual(bufferExpected, sameLengthAsExpected);
    return false;
  }
  return timingSafeEqual(bufferExpected, bufferReceived);
}

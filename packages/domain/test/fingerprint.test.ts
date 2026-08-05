import { describe, it, expect } from "vitest";
import {
  fingerprintFromFields,
  stableStringify,
  generateCorrelationCode,
  sha256Hex,
} from "../src/fingerprint.js";

describe("stableStringify", () => {
  it("produces deterministic output", () => {
    const a = stableStringify({ b: 1, a: 2 });
    const b = stableStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("handles null", () => {
    expect(stableStringify(null)).toBe("null");
  });

  it("filters undefined keys", () => {
    const result = stableStringify({ a: 1, b: undefined });
    expect(result).toBe('{"a":1}');
  });
});

describe("sha256Hex", () => {
  it("produces expected hash", () => {
    const hash = sha256Hex("test");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("fingerprintFromFields", () => {
  it("produces consistent fingerprint for same data", () => {
    const fp1 = fingerprintFromFields({ x: 1, y: 2 });
    const fp2 = fingerprintFromFields({ y: 2, x: 1 });
    expect(fp1).toBe(fp2);
  });
});

describe("generateCorrelationCode", () => {
  it("generates PC- prefix with 6 hex chars", () => {
    const code = generateCorrelationCode();
    expect(code).toMatch(/^PC-[A-Z0-9]{6}$/);
  });
});

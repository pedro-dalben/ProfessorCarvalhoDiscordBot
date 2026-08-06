import { describe, it, expect } from "vitest";
import {
  stableStringify,
  sha256Hex,
  fingerprintFromFields,
  generateCorrelationCode,
  safeTokenCompare,
} from "../src/fingerprint.js";

describe("fingerprint (hash e comparação constante)", () => {
  it("stableStringify ordena chaves e ignora undefined", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableStringify({ a: 1, c: undefined })).toBe('{"a":1}');
  });

  it("stableStringify lida com arrays e valores primitivos", () => {
    expect(stableStringify([1, "x", null])).toBe('[1,"x",null]');
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify("texto")).toBe('"texto"');
  });

  it("sha256Hex produz hash estável", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("fingerprintFromFields combina stableStringify + sha256", () => {
    const a = fingerprintFromFields({ x: 1, y: 2 });
    const b = fingerprintFromFields({ y: 2, x: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generateCorrelationCode tem formato PC-XXXXXX", () => {
    expect(generateCorrelationCode()).toMatch(/^PC-[A-Z0-9]{6}$/);
  });

  it("safeTokenCompare rejeita tamanhos diferentes sem lançar", () => {
    expect(safeTokenCompare("abcdefghijklmnop", "abc")).toBe(false);
  });

  it("safeTokenCompare aceita igualdade e rejeita diferença", () => {
    expect(safeTokenCompare("token-igual-12345678", "token-igual-12345678")).toBe(true);
    expect(safeTokenCompare("token-igual-12345678", "token-diferente-9999")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { normalizeName, splitForm, levenshtein } from "../src/normalize.js";

describe("normalizeName", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeName("Pikachu")).toBe("pikachu");
    expect(normalizeName("Électric")).toBe("electric");
  });

  it("handles special names", () => {
    expect(normalizeName("Mr. Mime")).toBe("mr-mime");
    expect(normalizeName("Farfetch'd")).toBe("farfetchd");
    expect(normalizeName("Farfetch’d")).toBe("farfetchd");
    expect(normalizeName("Nidoran♀")).toBe("nidoran-f");
    expect(normalizeName("Nidoran♂")).toBe("nidoran-m");
    expect(normalizeName("Type: Null")).toBe("type-null");
    expect(normalizeName("Tapu Koko")).toBe("tapu-koko");
    expect(normalizeName("Ho-Oh")).toBe("ho-oh");
  });

  it("handles paradox Pokémon names", () => {
    expect(normalizeName("Great Tusk")).toBe("great-tusk");
    expect(normalizeName("Iron Valiant")).toBe("iron-valiant");
    expect(normalizeName("Roaring Moon")).toBe("roaring-moon");
  });

  it("removes special characters", () => {
    expect(normalizeName("Pokémon")).toBe("pokemon");
    expect(normalizeName("Charizard ✓")).toBe("charizard");
    expect(normalizeName("test-foo-bar")).toBe("test-foo-bar");
  });
});

describe("splitForm", () => {
  it("splits known forms", () => {
    const result = splitForm("rotom-wash");
    expect(result.normalized).toBe("rotom-wash");
    expect(result.form).toBe("wash");
  });

  it("returns formless query for unknown suffix", () => {
    const result = splitForm("pikachu-bright");
    expect(result.form).toBeUndefined();
  });

  it("handles galarian forms", () => {
    const result = splitForm("farfetchd-galar");
    expect(result.normalized).toBe("farfetchd-galar");
    expect(result.form).toBe("galar");
  });
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("pikachu", "pikachu")).toBe(0);
  });

  it("computes distance 1 for one substitution", () => {
    expect(levenshtein("pikachu", "pikach")).toBe(1);
  });

  it("respects the cap", () => {
    expect(levenshtein("pikachu", "abcdefgh", 2)).toBe(3);
  });
});

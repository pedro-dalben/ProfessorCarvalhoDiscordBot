import { describe, it, expect } from "vitest";
import { normalizeCsaEvent } from "../src/normalize.js";
import { createCsaFixture } from "@bigbangcraft/testing";

describe("normalizeCsaEvent", () => {
  const options = { sourceVersion: "1.13.2", serverId: "bigmoncraft" };

  it("normalizes Pikachu CSA fixture with high-confidence marker", () => {
    const payload = createCsaFixture({
      dex: 25,
      level: 50,
      name: "Pikachu",
      biome: "Savanna Plateau",
      bucket: "ULTRA_RARE",
    });
    const event = normalizeCsaEvent(payload, options);

    expect(event.dexNumber).toBe(25);
    expect(event.level).toBe(50);
    expect(event.displayName).toBe("Pikachu");
    expect(event.biome).toBe("Savanna Plateau");
    expect(event.bucket).toBe("ULTRA_RARE");
    expect(event.parsedConfidence).toBe("high");
    expect(event.coordinates).toBeDefined();
    expect(event.coordinates?.x).toBe(1234);
    expect(event.coordinates?.z).toBe(-567);
  });

  it("normalizes shiny event", () => {
    const payload = createCsaFixture({
      dex: 149,
      name: "Dragonite",
      shiny: true,
    });
    const event = normalizeCsaEvent(payload, options);

    expect(event.shiny).toBe(true);
    expect(event.parsedConfidence).toBe("high");
    expect(event.displayName).toBe("Dragonite");
  });

  it("normalizes legendary event", () => {
    const payload = createCsaFixture({
      dex: 144,
      name: "Articuno",
      legendary: true,
    });
    const event = normalizeCsaEvent(payload, options);

    expect(event.legendary).toBe(true);
    expect(event.parsedConfidence).toBe("high");
  });

  it("normalizes mythical event", () => {
    const payload = createCsaFixture({
      dex: 151,
      name: "Mew",
      mythical: true,
    });
    const event = normalizeCsaEvent(payload, options);

    expect(event.mythical).toBe(true);
    expect(event.parsedConfidence).toBe("high");
  });

  it("returns low-confidence event for non-marker payload", () => {
    const payload: Record<string, unknown> = {
      content: "**Pokémon**: Squirtle\n**Level**: 15\n**Bioma**: Forest",
    };
    const event = normalizeCsaEvent(payload, options);

    expect(event.parsedConfidence).toBe("low");
    expect(event.displayName).toBe("Squirtle");
    expect(event.level).toBe(15);
    expect(event.biome).toBe("Forest");
  });

  it("returns undefined for missing optional fields", () => {
    const payload: Record<string, unknown> = {
      content: "A wild Pokémon appeared!",
    };
    const event = normalizeCsaEvent(payload, options);

    expect(event.parsedConfidence).toBe("low");
    expect(event.displayName).toBeUndefined();
    expect(event.level).toBeUndefined();
    expect(event.biome).toBeUndefined();
  });

  it("never returns placeholder level 50", () => {
    const payload = createCsaFixture({ dex: 25, level: 42, name: "Pikachu" });
    const event = normalizeCsaEvent(payload, options);
    expect(event.level).toBe(42);
  });

  it("never returns placeholder Savanna biome", () => {
    const payload = createCsaFixture({
      dex: 25,
      name: "Pikachu",
      biome: "Forest",
    });
    const event = normalizeCsaEvent(payload, options);
    expect(event.biome).toBe("Forest");
  });
});

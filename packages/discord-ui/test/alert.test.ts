import { describe, it, expect } from "vitest";
import { buildSpawnAlertEmbed } from "../src/embeds/alert.js";
import { sanitizedSpawnAlertEvent } from "@bigbangcraft/testing";

const defaultOptions = {
  coordinatePolicy: "region" as const,
  regionGridSize: 500,
  showNearestPlayer: false,
  serverAddress: "bigmoncraft.bigbangcraft.com.br",
};

describe("buildSpawnAlertEmbed", () => {
  it("includes real species name", () => {
    const event = sanitizedSpawnAlertEvent({
      species: "pikachu",
      displayName: "Pikachu",
      dexNumber: 25,
      biome: "Forest",
      bucket: "RARE",
    });
    const embed = buildSpawnAlertEmbed(event, defaultOptions);
    expect(embed).not.toBeNull();
    expect(embed!.description).toContain("Pikachu");
  });

  it("does not use placeholder level 50 when real data exists", () => {
    const event = sanitizedSpawnAlertEvent({
      level: 42,
      dexNumber: 25,
    });
    const embed = buildSpawnAlertEmbed(event, defaultOptions);
    expect(embed).not.toBeNull();
    expect(embed!.description).toContain("**Nível**: 42");
    expect(embed!.description).not.toContain("**Nível**: 50");
  });

  it("does not use placeholder Savanna biome when real data exists", () => {
    const event = sanitizedSpawnAlertEvent({
      biome: "Taiga",
      dexNumber: 25,
    });
    const embed = buildSpawnAlertEmbed(event, defaultOptions);
    expect(embed).not.toBeNull();
    expect(embed!.description).toContain("Taiga");
    expect(embed!.description).not.toContain("Savanna");
  });

  it("omits missing optional fields", () => {
    const event = sanitizedSpawnAlertEvent({
      displayName: undefined,
      species: undefined,
      level: undefined,
      biome: undefined,
      bucket: undefined,
      dexNumber: 0,
    });
    const embed = buildSpawnAlertEmbed(event, defaultOptions);
    expect(embed).not.toBeNull();
    expect(embed!.description).not.toContain("Nível");
    expect(embed!.description).not.toContain("Bioma");
  });

  it("uses Pokédex artwork for known dexNumber", () => {
    const event = sanitizedSpawnAlertEvent({ dexNumber: 25 });
    const embed = buildSpawnAlertEmbed(event, defaultOptions);
    expect(embed).not.toBeNull();
    expect(embed!.image?.url).toContain("raw.githubusercontent.com");
    expect(embed!.image?.url).toContain("25.png");
  });

  it("shows shiny title for shiny events", () => {
    const shiny = sanitizedSpawnAlertEvent({ shiny: true });
    const embed = buildSpawnAlertEmbed(shiny, defaultOptions);
    expect(embed).not.toBeNull();
    expect(embed!.title).toContain("shiny");
    expect(embed!.color).toBe(0xffd700);
  });

  it("shows legendary title for legendary events", () => {
    const legendary = sanitizedSpawnAlertEvent({ legendary: true });
    const embed = buildSpawnAlertEmbed(legendary, defaultOptions);
    expect(embed).not.toBeNull();
    expect(embed!.color).toBe(0xe74c3c);
  });

  it("shows rare title for ULTRA_RARE bucket", () => {
    const rare = sanitizedSpawnAlertEvent({ bucket: "ULTRA_RARE" });
    const embed = buildSpawnAlertEmbed(rare, defaultOptions);
    expect(embed).not.toBeNull();
    expect(embed!.color).toBe(0x3498db);
  });

  it("shows approximate region when coordinatePolicy is region", () => {
    const event = sanitizedSpawnAlertEvent({
      coordinates: { x: 1234, z: -567 },
    });
    const embed = buildSpawnAlertEmbed(event, {
      ...defaultOptions,
      coordinatePolicy: "region",
    });
    expect(embed).not.toBeNull();
    expect(embed!.description).toContain("Região aproximada");
  });

  it("hides coordinates when coordinatePolicy is hidden", () => {
    const event = sanitizedSpawnAlertEvent({
      coordinates: { x: 1234, z: -567 },
    });
    const embed = buildSpawnAlertEmbed(event, {
      ...defaultOptions,
      coordinatePolicy: "hidden",
    });
    expect(embed).not.toBeNull();
    expect(embed!.description).not.toContain("Região aproximada");
  });
});

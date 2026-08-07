import { describe, it, expect } from "vitest";
import {
  gameEventIdempotencyKey,
  pokedexMilestoneForCount,
  POKEDEX_MILESTONES,
  isTerminalLifecycleStatus,
} from "../src/gameEvent.js";

describe("gameEventIdempotencyKey", () => {
  it("produz chave determinística para mesma origem e sourceEventId", () => {
    const key1 = gameEventIdempotencyKey({
      source: "gateway",
      sourceEventId: "event-123",
    });
    const key2 = gameEventIdempotencyKey({
      source: "gateway",
      sourceEventId: "event-123",
    });
    expect(key1).toBe(key2);
  });

  it("produz chaves diferentes para origens diferentes", () => {
    const key1 = gameEventIdempotencyKey({
      source: "gateway",
      sourceEventId: "evt-1",
    });
    const key2 = gameEventIdempotencyKey({
      source: "bigbang-spawn-alerts",
      sourceEventId: "evt-1",
    });
    expect(key1).not.toBe(key2);
  });

  it("produz chaves diferentes para sourceEventId diferentes", () => {
    const key1 = gameEventIdempotencyKey({
      source: "gateway",
      sourceEventId: "a",
    });
    const key2 = gameEventIdempotencyKey({
      source: "gateway",
      sourceEventId: "b",
    });
    expect(key1).not.toBe(key2);
  });

  it("funciona sem sourceEventId", () => {
    const key = gameEventIdempotencyKey({
      source: "system",
      sourceEventId: undefined,
    });
    expect(typeof key).toBe("string");
    expect(key.length).toBe(64);
  });
});

describe("isTerminalLifecycleStatus", () => {
  it("reconhece status terminais", () => {
    expect(isTerminalLifecycleStatus("CAPTURED")).toBe(true);
    expect(isTerminalLifecycleStatus("DEFEATED")).toBe(true);
    expect(isTerminalLifecycleStatus("DESPAWNED")).toBe(true);
    expect(isTerminalLifecycleStatus("REMOVED")).toBe(true);
  });

  it("reconhece status não terminais", () => {
    expect(isTerminalLifecycleStatus("SPAWNED")).toBe(false);
    expect(isTerminalLifecycleStatus("IN_BATTLE")).toBe(false);
    expect(isTerminalLifecycleStatus("UNKNOWN")).toBe(false);
  });
});

describe("pokedexMilestoneForCount", () => {
  it("retorna milestone quando cruza o marco", () => {
    expect(pokedexMilestoneForCount(50, 49)).toBe(50);
    expect(pokedexMilestoneForCount(100, 99)).toBe(100);
    expect(pokedexMilestoneForCount(400, 399)).toBe(400);
  });

  it("retorna null quando já passou do marco", () => {
    expect(pokedexMilestoneForCount(51, 50)).toBeNull();
    expect(pokedexMilestoneForCount(401, 400)).toBeNull();
  });

  it("retorna null quando não cruza nenhum marco", () => {
    expect(pokedexMilestoneForCount(5, 4)).toBeNull();
    expect(pokedexMilestoneForCount(350, 349)).toBeNull();
  });

  it("retorna o primeiro milestone quando cruza vários", () => {
    expect(pokedexMilestoneForCount(110, 40)).toBe(50);
  });

  it("lista de milestones contém valores corretos", () => {
    expect(POKEDEX_MILESTONES).toContain(50);
    expect(POKEDEX_MILESTONES).toContain(100);
    expect(POKEDEX_MILESTONES).toContain(200);
    expect(POKEDEX_MILESTONES).toContain(400);
    expect(POKEDEX_MILESTONES).toContain(900);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { SpawnDedupService } from "../src/dedup.js";
import { sanitizedSpawnAlertEvent } from "@bigbangcraft/testing";
import { createMemoryStore } from "@bigbangcraft/testing";

describe("SpawnDedupService", () => {
  let store: ReturnType<typeof createMemoryStore>;
  let service: SpawnDedupService;

  beforeEach(() => {
    store = createMemoryStore();
    service = new SpawnDedupService({
      store,
      windowSeconds: 90,
      keyPrefix: "test:",
    });
  });

  it("suppresses exact same event", async () => {
    const event = sanitizedSpawnAlertEvent({ dexNumber: 25, level: 50 });
    const first = await service.acquire(event);
    expect(first).toBe(true);

    const second = await service.acquire(event);
    expect(second).toBe(false);
  });

  it("does not suppress different Pokemon in same bucket", async () => {
    const pikachu = sanitizedSpawnAlertEvent({
      dexNumber: 25,
      bucket: "ULTRA_RARE",
      species: "Pikachu",
    });
    const eevee = sanitizedSpawnAlertEvent({
      dexNumber: 133,
      bucket: "ULTRA_RARE",
      species: "Eevee",
    });

    const acquired1 = await service.acquire(pikachu);
    expect(acquired1).toBe(true);

    const acquired2 = await service.acquire(eevee);
    expect(acquired2).toBe(true);
  });

  it("does not suppress same species at different coordinates", async () => {
    const atA = sanitizedSpawnAlertEvent({
      dexNumber: 25,
      coordinates: { x: 100, y: 64, z: 200 },
    });
    const atB = sanitizedSpawnAlertEvent({
      dexNumber: 25,
      coordinates: { x: 5000, y: 64, z: -3000 },
    });

    const acquired1 = await service.acquire(atA);
    expect(acquired1).toBe(true);

    const acquired2 = await service.acquire(atB);
    expect(acquired2).toBe(true);
  });

  it("suppresses retry of same payload", async () => {
    const event = sanitizedSpawnAlertEvent({
      dexNumber: 25,
      bucket: "ULTRA_RARE",
    });
    const first = await service.acquire(event);
    expect(first).toBe(true);

    const retry = await service.acquire(event);
    expect(retry).toBe(false);
  });

  it("accepts events outside dedup window", async () => {
    const oldEvent = sanitizedSpawnAlertEvent({
      dexNumber: 25,
      receivedAt: new Date(Date.now() - 120 * 1000).toISOString(),
    });
    const newEvent = sanitizedSpawnAlertEvent({
      dexNumber: 25,
      receivedAt: new Date().toISOString(),
    });

    const acquired1 = await service.acquire(oldEvent);
    expect(acquired1).toBe(true);

    const acquired2 = await service.acquire(newEvent);
    expect(acquired2).toBe(true);
  });

  it("handles concurrent requests atomically via SET NX", async () => {
    const event = sanitizedSpawnAlertEvent({ dexNumber: 25 });
    const results = await Promise.all(Array.from({ length: 10 }, () => service.acquire(event)));

    const acquiredCount = results.filter(Boolean).length;
    expect(acquiredCount).toBe(1);
  });

  it("includes mythical and ultraBeast in dedup fingerprint", async () => {
    const mythical = sanitizedSpawnAlertEvent({
      dexNumber: 151,
      mythical: true,
      bucket: "LEGENDARY",
    });
    const normal = sanitizedSpawnAlertEvent({
      dexNumber: 151,
      mythical: false,
      bucket: "LEGENDARY",
    });

    const acquired1 = await service.acquire(mythical);
    expect(acquired1).toBe(true);

    const acquired2 = await service.acquire(normal);
    expect(acquired2).toBe(true);
  });

  it("includes paradox in dedup fingerprint", async () => {
    const paradox = sanitizedSpawnAlertEvent({
      dexNumber: 1005,
      paradox: true,
    });
    const normal = sanitizedSpawnAlertEvent({
      dexNumber: 1005,
      paradox: false,
    });

    const acquired1 = await service.acquire(paradox);
    expect(acquired1).toBe(true);
    const acquired2 = await service.acquire(normal);
    expect(acquired2).toBe(true);
  });
});

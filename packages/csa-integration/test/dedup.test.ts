import { describe, it, expect, beforeEach } from "vitest";
import { SpawnDedupService, type DedupStore } from "../src/dedup.js";
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

  it("suprime o mesmo evento enviado duas vezes", async () => {
    const event = sanitizedSpawnAlertEvent({ dexNumber: 25, level: 50 });
    const first = await service.acquire(event);
    expect(first.accepted).toBe(true);

    const second = await service.acquire(event);
    expect(second.accepted).toBe(false);
  });

  it("não suprime Pokémon diferentes no mesmo bucket", async () => {
    const pikachu = sanitizedSpawnAlertEvent({
      dexNumber: 25,
      bucket: "Ultra Rare",
      species: "Pikachu",
    });
    const eevee = sanitizedSpawnAlertEvent({
      dexNumber: 133,
      bucket: "Ultra Rare",
      species: "Eevee",
    });

    expect((await service.acquire(pikachu)).accepted).toBe(true);
    expect((await service.acquire(eevee)).accepted).toBe(true);
  });

  it("não suprime a mesma espécie em regiões diferentes", async () => {
    const atA = sanitizedSpawnAlertEvent({
      dexNumber: 25,
      coordinates: { x: 100, y: 64, z: 200 },
    });
    const atB = sanitizedSpawnAlertEvent({
      dexNumber: 25,
      coordinates: { x: 5000, y: 64, z: -3000 },
    });

    expect((await service.acquire(atA)).accepted).toBe(true);
    expect((await service.acquire(atB)).accepted).toBe(true);
  });

  it("aceita eventos idênticos fora da janela", async () => {
    const oldEvent = sanitizedSpawnAlertEvent({
      dexNumber: 25,
      receivedAt: new Date(Date.now() - 120 * 1000).toISOString(),
    });
    const newEvent = sanitizedSpawnAlertEvent({
      dexNumber: 25,
      receivedAt: new Date().toISOString(),
    });

    expect((await service.acquire(oldEvent)).accepted).toBe(true);
    expect((await service.acquire(newEvent)).accepted).toBe(true);
  });

  it("requisições simultâneas geram apenas um evento (SET NX atômico)", async () => {
    const event = sanitizedSpawnAlertEvent({ dexNumber: 25 });
    const results = await Promise.all(Array.from({ length: 10 }, () => service.acquire(event)));

    const acquiredCount = results.filter((r) => r.accepted).length;
    expect(acquiredCount).toBe(1);
  });

  it("política fail-open: falha do Redis aceita o evento (não perde alerta)", async () => {
    const failingStore: DedupStore = {
      setNx(): Promise<boolean> {
        return Promise.reject(new Error("Redis indisponível"));
      },
    };
    const failOpen = new SpawnDedupService({
      store: failingStore,
      windowSeconds: 90,
      keyPrefix: "test:",
      onRedisFailure: "fail-open",
    });

    const result = await failOpen.acquire(sanitizedSpawnAlertEvent({ dexNumber: 25 }));
    expect(result.accepted).toBe(true);
  });

  it("política fail-closed: falha do Redis propaga erro", async () => {
    const failingStore: DedupStore = {
      setNx(): Promise<boolean> {
        return Promise.reject(new Error("Redis indisponível"));
      },
    };
    const failClosed = new SpawnDedupService({
      store: failingStore,
      windowSeconds: 90,
      keyPrefix: "test:",
      onRedisFailure: "fail-closed",
    });

    await expect(failClosed.acquire(sanitizedSpawnAlertEvent())).rejects.toThrow(
      "Redis indisponível",
    );
  });

  it("fingerprint inclui coordenadas arredondadas (mesma região suprime)", async () => {
    const a = sanitizedSpawnAlertEvent({ coordinates: { x: 100, y: 64, z: 200 } });
    const b = sanitizedSpawnAlertEvent({ coordinates: { x: 110, y: 64, z: 205 } });
    expect((await service.acquire(a)).accepted).toBe(true);
    expect((await service.acquire(b)).accepted).toBe(false);
  });

  it("fingerprint separa regiões distintas", async () => {
    const near = sanitizedSpawnAlertEvent({ coordinates: { x: 100, y: 64, z: 200 } });
    const far = sanitizedSpawnAlertEvent({ coordinates: { x: 5000, y: 64, z: 200 } });
    expect((await service.acquire(near)).accepted).toBe(true);
    expect((await service.acquire(far)).accepted).toBe(true);
  });

  it("fingerprint inclui shiny, legendary, mythical, ultraBeast, paradox, bucket e biome", async () => {
    const base = { dexNumber: 149, level: 75 } as const;
    const shiny = sanitizedSpawnAlertEvent({ ...base, shiny: true });
    const notShiny = sanitizedSpawnAlertEvent({ ...base, shiny: false });
    expect((await service.acquire(shiny)).accepted).toBe(true);
    expect((await service.acquire(notShiny)).accepted).toBe(true);

    const legendary = sanitizedSpawnAlertEvent({ ...base, legendary: true });
    expect((await service.acquire(legendary)).accepted).toBe(true);

    const mythical = sanitizedSpawnAlertEvent({ ...base, mythical: true });
    expect((await service.acquire(mythical)).accepted).toBe(true);

    const ultraBeast = sanitizedSpawnAlertEvent({ ...base, ultraBeast: true });
    expect((await service.acquire(ultraBeast)).accepted).toBe(true);

    const paradox = sanitizedSpawnAlertEvent({ ...base, paradox: true });
    expect((await service.acquire(paradox)).accepted).toBe(true);

    const differentBucket = sanitizedSpawnAlertEvent({ ...base, bucket: "Rare" });
    expect((await service.acquire(differentBucket)).accepted).toBe(true);

    const differentBiome = sanitizedSpawnAlertEvent({ ...base, biome: "Ocean" });
    expect((await service.acquire(differentBiome)).accepted).toBe(true);
  });
});

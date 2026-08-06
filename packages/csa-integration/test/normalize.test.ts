import { describe, it, expect } from "vitest";
import { normalizeCsaEvent } from "../src/normalize.js";
import { createCsaFixture, sanitizedSpawnAlertEvent } from "@bigbangcraft/testing";

describe("normalizeCsaEvent", () => {
  const options = { sourceVersion: "1.13.2", serverId: "bigmoncraft" };

  it("produz evento completo a partir do marcador", () => {
    const fixture = createCsaFixture({ dex: 130, level: 55, name: "Gyarados", shiny: true });
    const result = normalizeCsaEvent(fixture, options);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.dexNumber).toBe(130);
      expect(result.event.level).toBe(55);
      expect(result.event.displayName).toBe("Gyarados");
      expect(result.event.shiny).toBe(true);
      expect(result.event.parsedConfidence).toBe("high");
    }
  });

  it("rejeita payload sem marcador em modo relay", () => {
    const result = normalizeCsaEvent(
      { content: "sem marcador" },
      { ...options, requireMarker: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CSA_MARKER_MISSING");
  });

  it("rejeita marcador com valores desconhecidos em modo relay", () => {
    const fixture = createCsaFixture();
    fixture.content = fixture.content?.replace("rarity=", "rarity=UnknownThing|");
    const result = normalizeCsaEvent(fixture, { ...options, requireMarker: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CSA_MARKER_UNPARSEABLE");
  });

  it("aceita payload sem marcador fora do modo relay (fallback baixa confiança)", () => {
    const result = normalizeCsaEvent(
      { content: "Um Pikachu selvagem apareceu!" },
      { ...options, requireMarker: false },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.event.parsedConfidence).toBe("low");
  });

  it("parseia shiny e legendary corretamente", () => {
    const fixture = createCsaFixture({ dex: 149, name: "Dragonite", shiny: true, legendary: true });
    const result = normalizeCsaEvent(fixture, options);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.shiny).toBe(true);
      expect(result.event.legendary).toBe(true);
    }
  });

  it("sem valores opcionais: flags falsos, sem coordenadas inválidas", () => {
    const fixture = createCsaFixture({
      shiny: false,
      legendary: false,
      player: "",
      timestamp: 1754400000000,
    });
    const result = normalizeCsaEvent(fixture, options);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.shiny).toBe(false);
      expect(result.event.legendary).toBe(false);
      expect(result.event.nearestPlayer).toBeUndefined();
    }
  });

  it("preserva receivedAt do marcador (timestamp do JAR)", () => {
    const fixture = createCsaFixture({ timestamp: 1754400000000 });
    const result = normalizeCsaEvent(fixture, options);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.receivedAt).toBe(new Date(1754400000000).toISOString());
    }
  });
});

describe("sanitizedSpawnAlertEvent (helper de testes)", () => {
  it("gera evento padrão utilizável", () => {
    const event = sanitizedSpawnAlertEvent();
    expect(event.dexNumber).toBe(25);
    expect(event.serverId).toBe("test-server");
    expect(event.sourceVersion).toBe("1.13.2");
  });
});

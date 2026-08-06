import { describe, it, expect } from "vitest";
import {
  isCoordinatePolicy,
  roundToRegion,
  formatRegionPt,
  stripCoordinates,
  describeRegionPolicyPt,
} from "../src/coordinates.js";
import { formatDateTimePt, usageDateKey } from "../src/time.js";
import { ProfessorError, isRetryableHttpError, mapHttpErrorToCode } from "../src/errors.js";
import { buildAllowedMentions, isDiscordSnowflake } from "../src/mentions.js";
import { checkEmbedTextLimits, EMBED_TITLE_MAX } from "../src/embedLimits.js";
import { stableStringify } from "../src/fingerprint.js";
import { escapeMarkdown, truncateByCodePoints, sanitizeForDiscord } from "../src/markdown.js";
import { typeLabelPtSafe } from "../src/pokemonTypes.js";

describe("coordinates", () => {
  it("isCoordinatePolicy valida políticas", () => {
    expect(isCoordinatePolicy("hidden")).toBe(true);
    expect(isCoordinatePolicy("region")).toBe(true);
    expect(isCoordinatePolicy("exact_admin_only")).toBe(true);
    expect(isCoordinatePolicy("public")).toBe(false);
  });

  it("roundToRegion arredonda para a grade", () => {
    const region = roundToRegion(1234, -567, 500);
    expect(region).toEqual({ xMin: 1000, xMax: 1499, zMin: -1000, zMax: -501 });
  });

  it("roundToRegion rejeita entrada inválida", () => {
    expect(() => roundToRegion(Number.NaN, 1, 500)).toThrow();
    expect(() => roundToRegion(1, 1, 0)).toThrow();
  });

  it("formatRegionPt formata a região", () => {
    const region = roundToRegion(1234, -567, 500);
    expect(formatRegionPt(region)).toContain("1000");
    expect(formatRegionPt(region)).toContain("-1000");
  });

  it("stripCoordinates remove coordenadas", () => {
    const event = { coordinates: { x: 1, y: 2, z: 3 }, name: "x" };
    const stripped = stripCoordinates(event);
    expect(stripped.coordinates).toBeUndefined();
    expect(stripped.name).toBe("x");
  });

  it("describeRegionPolicyPt descreve cada política", () => {
    expect(describeRegionPolicyPt("hidden")).toBeTruthy();
    expect(describeRegionPolicyPt("region")).toBeTruthy();
    expect(describeRegionPolicyPt("exact_admin_only")).toBeTruthy();
  });
});

describe("time", () => {
  it("formatDateTimePt formata com locale pt-BR", () => {
    const formatted = formatDateTimePt(new Date("2025-08-05T12:00:00Z"));
    expect(formatted).toContain("05/08/2025");
  });

  it("usageDateKey gera chave de data", () => {
    const key = usageDateKey(new Date("2025-08-05T12:00:00Z"));
    expect(key).toContain("2025-08-05");
  });
});

describe("fingerprint e utilitários", () => {
  it("stableStringify lida com objetos aninhados e undefined em meio", () => {
    const nested = { a: { c: 3, b: 2 }, d: undefined };
    expect(stableStringify(nested)).toBe('{"a":{"b":2,"c":3}}');
    expect(stableStringify([1, undefined, 3])).toBe("[1,,3]");
  });

  it("ProfessorError retryable flag", () => {
    const error = new ProfessorError("REDIS_UNAVAILABLE", "msg", { retryable: true });
    expect(error.retryable).toBe(true);
    expect(new ProfessorError("CSA_INVALID_PAYLOAD", "m").retryable).toBe(false);
  });

  it("formatDateTimePt formata com horário de São Paulo", () => {
    const formatted = formatDateTimePt(new Date("2025-08-05T15:00:00Z"));
    expect(formatted).toContain("05/08/2025");
    expect(formatted).toContain("12:00");
  });

  it("checkEmbedTextLimits reporta violações de fields individuais", () => {
    const violations = checkEmbedTextLimits({
      fields: [{ name: "n".repeat(300), value: "ok" }],
    });
    expect(violations.some((v) => v.field === "fields[0].name")).toBe(true);
  });

  it("describeRegionPolicyPt retorna texto para qualquer política", () => {
    for (const policy of ["hidden", "region", "exact_admin_only"] as const) {
      expect(describeRegionPolicyPt(policy).length).toBeGreaterThan(0);
    }
  });
});

describe("errors", () => {
  it("ProfessorError carrega código", () => {
    const error = new ProfessorError("CSA_INVALID_TOKEN", "msg");
    expect(error.code).toBe("CSA_INVALID_TOKEN");
    expect(error.message).toBe("msg");
  });

  it("isRetryableHttpError classifica status", () => {
    expect(isRetryableHttpError(429)).toBe(true);
    expect(isRetryableHttpError(500)).toBe(true);
    expect(isRetryableHttpError(400)).toBe(false);
  });

  it("mapHttpErrorToCode mapeia status", () => {
    expect(mapHttpErrorToCode(404)).toBe("POKEMON_NOT_FOUND");
    expect(mapHttpErrorToCode(503)).toBe("POKEDEX_PROVIDER_UNAVAILABLE");
    expect(mapHttpErrorToCode(200)).toBe("POKEMON_NOT_FOUND");
  });
});

describe("mentions", () => {
  it("isDiscordSnowflake valida formato", () => {
    expect(isDiscordSnowflake("123456789012345678")).toBe(true);
    expect(isDiscordSnowflake("abc")).toBe(false);
  });

  it("buildAllowedMentions filtra IDs inválidos", () => {
    expect(buildAllowedMentions(["123456789012345678", "não-é-id"])).toEqual({
      parse: [],
      roles: ["123456789012345678"],
    });
    expect(buildAllowedMentions([])).toEqual({ parse: [] });
    expect(buildAllowedMentions(["abc"])).toEqual({ parse: [] });
  });
});

describe("embedLimits", () => {
  it("checkEmbedTextLimits detecta violações", () => {
    const violations = checkEmbedTextLimits({
      title: "x".repeat(EMBED_TITLE_MAX + 1),
      fields: [{ name: "n", value: "v" }],
    });
    expect(violations.some((v) => v.field === "title")).toBe(true);
    expect(violations.length).toBe(1);
  });

  it("checkEmbedTextLimits aceita embed válido", () => {
    expect(checkEmbedTextLimits({ title: "ok", description: "ok" })).toEqual([]);
  });

  it("checkEmbedTextLimits conta campos acima do limite", () => {
    const violations = checkEmbedTextLimits({
      fields: Array.from({ length: 30 }, () => ({ name: "n", value: "v" })),
    });
    expect(violations.some((v) => v.field === "fields.length")).toBe(true);
  });
});

describe("markdown e tipos", () => {
  it("escapeMarkdown escapa caracteres e @", () => {
    expect(escapeMarkdown("a*b_c`d")).toContain("\\*");
    expect(escapeMarkdown("oi@você")).toContain("@\u200b");
  });

  it("truncateByCodePoints trunca acima do limite", () => {
    expect(truncateByCodePoints("abc", 10)).toBe("abc");
    expect(truncateByCodePoints("abcdef", 3)).toBe("ab…");
  });

  it("sanitizeForDiscord combina escape e truncamento", () => {
    expect(sanitizeForDiscord("ok")).toBe("ok");
    expect(sanitizeForDiscord("*x*".repeat(500), 20).length).toBeLessThanOrEqual(20);
  });

  it("typeLabelPtSafe mantém tipos válidos e devolve texto desconhecido", () => {
    expect(typeLabelPtSafe("fire")).toBe("Fogo");
    expect(typeLabelPtSafe("not-a-type")).toBe("not-a-type");
  });
});

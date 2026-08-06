import { describe, it, expect } from "vitest";
import { validateCsaPayload } from "../src/payload.js";
import { createCsaFixture, createMalformedPayload } from "@bigbangcraft/testing";

describe("validateCsaPayload", () => {
  it("accepts valid CSA fixture", () => {
    const result = validateCsaPayload(createCsaFixture());
    expect(result.ok).toBe(true);
  });

  it("rejects malformed payload", () => {
    const result = validateCsaPayload(createMalformedPayload());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_CSA_PAYLOAD");
    }
  });

  it("rejects empty payload", () => {
    const result = validateCsaPayload({});
    expect(result.ok).toBe(false);
  });

  it("accepts payload with only content", () => {
    const result = validateCsaPayload({ content: "A wild Pikachu appeared!" });
    expect(result.ok).toBe(true);
  });

  it("accepts payload with only embeds", () => {
    const result = validateCsaPayload({
      embeds: [{ description: "A wild pokemon" }],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts nullish optional fields (Jackson serialization do CSA)", () => {
    const result = validateCsaPayload({
      content: "PC_CSA_V1|x=1|y=2|z=3",
      username: null,
      avatar_url: null,
      tts: null,
      embeds: [
        {
          title: "apareceu!",
          description: null,
          color: null,
          url: null,
          timestamp: false,
          thumbnail: null,
          image: null,
          author: { name: "", url: null, icon_url: null },
          fields: null,
          footer: { text: "BigMonCraft", icon_url: null },
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts numeric color (formato aceito pelo Discord)", () => {
    const result = validateCsaPayload({
      embeds: [{ title: "t", color: 16711680 }],
    });
    expect(result.ok).toBe(true);
  });

  it("still rejects oversized field values", () => {
    const result = validateCsaPayload({
      embeds: [{ fields: [{ name: "x", value: "a".repeat(2048) }] }],
    });
    expect(result.ok).toBe(false);
  });

  it("strips avatar_url from accepted payload", () => {
    const result = validateCsaPayload({
      content: "Hello",
      avatar_url: "https://example.com/img.png",
    });
    if (result.ok) {
      expect(result.payload.avatar_url).toBe("https://example.com/img.png");
    }
  });
});

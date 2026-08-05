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

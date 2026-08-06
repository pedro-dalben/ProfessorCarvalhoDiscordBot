import { describe, expect, it } from "vitest";
import {
  generateLinkCode,
  hashLinkCode,
  isValidLinkCode,
  normalizeLinkCode,
} from "../src/identity/crypto.js";

describe("códigos BigBang ID", () => {
  it("usa formato Crockford sem ambiguidade e hash HMAC estável", () => {
    const code = generateLinkCode();
    expect(isValidLinkCode(code)).toBe(true);
    expect(code.split("-")[1]).not.toMatch(/[ILOU01]/);
    expect(hashLinkCode(code, "pepper-de-teste-com-32-bytes-0000")).toBe(
      hashLinkCode(
        normalizeLinkCode(` ${code.toLowerCase()} `),
        "pepper-de-teste-com-32-bytes-0000",
      ),
    );
  });
});

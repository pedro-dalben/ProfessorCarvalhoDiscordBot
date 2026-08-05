import { describe, it, expect } from "vitest";
import { escapeMarkdown, truncateByCodePoints } from "../src/markdown.js";

describe("escapeMarkdown", () => {
  it("escapes special markdown characters", () => {
    expect(escapeMarkdown("Hello *world*")).toBe("Hello \\*world\\*");
    expect(escapeMarkdown("test | pipe")).toBe("test \\| pipe");
    expect(escapeMarkdown("a > b")).toBe("a \\> b");
  });

  it("sanitizes @ mentions", () => {
    expect(escapeMarkdown("@everyone")).toBe("@\u200Beveryone");
  });
});

describe("truncateByCodePoints", () => {
  it("does not truncate short text", () => {
    expect(truncateByCodePoints("abc", 10)).toBe("abc");
  });

  it("truncates with ellipsis", () => {
    const result = truncateByCodePoints("Hello World", 5);
    expect(result).toHaveLength(5);
    expect(result).toBe("Hell…");
  });
});

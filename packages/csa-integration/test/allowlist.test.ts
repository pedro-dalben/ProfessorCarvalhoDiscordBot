import { describe, it, expect } from "vitest";
import { parseCidrList, isAllowed } from "../src/allowlist.js";

describe("CSA allowlist / CIDR", () => {
  describe("parseCidrList", () => {
    it("parses single IPv4 CIDR", () => {
      const entries = parseCidrList("10.0.0.0/8");
      expect(entries).toHaveLength(1);
      expect(entries[0]?.family).toBe(4);
      expect(entries[0]?.prefix).toBe(8);
    });

    it("parses multiple CIDRs separated by commas", () => {
      const entries = parseCidrList("10.0.0.0/8, 192.168.1.0/24");
      expect(entries).toHaveLength(2);
    });

    it("handles empty input", () => {
      expect(parseCidrList("")).toHaveLength(0);
      expect(parseCidrList(undefined)).toHaveLength(0);
    });

    it("parses single IP as /32", () => {
      const entries = parseCidrList("10.0.0.5");
      expect(entries).toHaveLength(1);
      expect(entries[0]?.prefix).toBe(32);
    });
  });

  describe("isAllowed", () => {
    const localCidrs = parseCidrList("10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16");

    it("allows in-range address", () => {
      expect(isAllowed("10.0.0.5", localCidrs)).toBe(true);
      expect(isAllowed("192.168.1.100", localCidrs)).toBe(true);
      expect(isAllowed("172.16.5.5", localCidrs)).toBe(true);
    });

    it("rejects out-of-range address", () => {
      expect(isAllowed("203.0.113.5", localCidrs)).toBe(false);
      expect(isAllowed("8.8.8.8", localCidrs)).toBe(false);
    });

    it("rejects empty list", () => {
      expect(isAllowed("127.0.0.1", [])).toBe(false);
    });

    it("handles WireGuard typical address", () => {
      const wgCidrs = parseCidrList("10.8.0.0/24");
      expect(isAllowed("10.8.0.5", wgCidrs)).toBe(true);
      expect(isAllowed("10.9.0.5", wgCidrs)).toBe(false);
    });

    it("rejects spoofed forwarded header IP", () => {
      const minecraftCidrs = parseCidrList("100.64.0.0/10");
      expect(isAllowed("192.168.1.1", minecraftCidrs)).toBe(false);
      expect(isAllowed("100.64.0.1", minecraftCidrs)).toBe(true);
    });
  });
});

import { describe, it, expect } from "vitest";
import { parseCidr, parseCidrList, isAllowed } from "../src/allowlist.js";

describe("allowlist CIDR", () => {
  it("parseCidr lida com IPv4 com e sem prefixo", () => {
    expect(parseCidr("10.0.0.0/8")).toEqual({ base: 0x0a000000n, prefix: 8, family: 4 });
    expect(parseCidr("192.168.1.1")).toEqual({ base: 0xc0a80101n, prefix: 32, family: 4 });
  });

  it("parseCidr lida com IPv6", () => {
    const parsed = parseCidr("fd00::/64");
    expect(parsed).not.toBeNull();
    expect(parsed!.family).toBe(6);
    expect(parsed!.prefix).toBe(64);
    const noPrefix = parseCidr("fd00::1");
    expect(noPrefix!.prefix).toBe(128);
  });

  it("parseCidr rejeita entradas inválidas", () => {
    expect(parseCidr("não-é-ip")).toBeNull();
    expect(parseCidr("10.0.0.0/99")).toBeNull();
    expect(parseCidr("10.0.0.0/abc")).toBeNull();
    expect(parseCidr("")).toBeNull();
  });

  it("parseCidrList aceita lista separada por vírgulas/espaços", () => {
    const list = parseCidrList("10.0.0.0/8, fd00::/64");
    expect(list.length).toBe(2);
    expect(parseCidrList(undefined)).toEqual([]);
    expect(parseCidrList("")).toEqual([]);
  });

  it("isAllowed respeita a máscara", () => {
    const list = parseCidrList("10.0.0.0/8");
    expect(isAllowed("10.1.2.3", list)).toBe(true);
    expect(isAllowed("11.0.0.1", list)).toBe(false);
  });

  it("isAllowed com lista vazia retorna false", () => {
    expect(isAllowed("10.0.0.1", [])).toBe(false);
  });

  it("isAllowed ignora famílias diferentes", () => {
    const ipv4Only = parseCidrList("10.0.0.0/8");
    expect(isAllowed("fd00::1", ipv4Only)).toBe(false);
  });

  it("isAllowed aceita IPv6 dentro do prefixo", () => {
    const list = parseCidrList("fd00::/64");
    expect(isAllowed("fd00::1234", list)).toBe(true);
    expect(isAllowed("fd01::1", list)).toBe(false);
  });

  it("isAllowed rejeita entradas não-IP", () => {
    expect(isAllowed("não-é-ip", parseCidrList("10.0.0.0/8"))).toBe(false);
  });
});

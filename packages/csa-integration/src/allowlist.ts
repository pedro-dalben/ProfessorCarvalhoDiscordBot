import { isIPv4, isIPv6 } from "node:net";

export interface CidrEntry {
  base: bigint;
  prefix: number;
  family: 4 | 6;
}

export function parseCidrList(raw: string | undefined): CidrEntry[] {
  if (!raw) return [];
  const entries: CidrEntry[] = [];
  for (const token of raw.split(/[,\s]+/)) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const parsed = parseCidr(trimmed);
    if (parsed) entries.push(parsed);
  }
  return entries;
}

export function parseCidr(cidr: string): CidrEntry | null {
  const [address, prefixStr] = cidr.split("/");
  if (!address) return null;

  if (isIPv4(address)) {
    const prefix = prefixStr !== undefined ? Number.parseInt(prefixStr, 10) : 32;
    if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return null;
    const base = ipv4ToBigInt(address);
    return { base, prefix, family: 4 };
  }

  if (isIPv6(address)) {
    const prefix = prefixStr !== undefined ? Number.parseInt(prefixStr, 10) : 128;
    if (!Number.isFinite(prefix) || prefix < 0 || prefix > 128) return null;
    const base = ipv6ToBigInt(address);
    return { base, prefix, family: 6 };
  }

  return null;
}

export function isAllowed(ip: string, cidrs: readonly CidrEntry[]): boolean {
  if (cidrs.length === 0) return false;

  let target: bigint;
  let family: 4 | 6;

  if (isIPv4(ip)) {
    target = ipv4ToBigInt(ip);
    family = 4;
  } else if (isIPv6(ip)) {
    target = ipv6ToBigInt(ip);
    family = 6;
  } else {
    return false;
  }

  for (const cidr of cidrs) {
    if (cidr.family !== family) continue;
    if (maskPrefix(target, cidr.prefix, family) === maskPrefix(cidr.base, cidr.prefix, family)) {
      return true;
    }
  }
  return false;
}

function maskPrefix(value: bigint, prefix: number, family: 4 | 6): bigint {
  const totalBits = family === 4 ? 32n : 128n;
  if (prefix <= 0) return 0n;
  if (BigInt(prefix) >= totalBits) return value;
  const shift = BigInt(family === 4 ? 32n : 128n) - BigInt(prefix);
  return (value >> shift) << shift;
}

function ipv4ToBigInt(ip: string): bigint {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return 0n;
  return (
    ((BigInt(parts[0] ?? 0) << 24n) |
      (BigInt(parts[1] ?? 0) << 16n) |
      (BigInt(parts[2] ?? 0) << 8n) |
      BigInt(parts[3] ?? 0)) &
    0xffffffffn
  );
}

function ipv6ToBigInt(ip: string): bigint {
  const normalized = normalizeIPv6(ip);
  const groups = normalized.split(":");
  let value = 0n;
  for (const group of groups) {
    const parsed = Number.parseInt(group || "0", 16);
    value = (value << 16n) | BigInt(Number.isNaN(parsed) ? 0 : parsed);
  }
  return value;
}

function normalizeIPv6(ip: string): string {
  const parts = ip.split("::");
  if (parts.length > 2) return "";
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts[1] ? parts[1].split(":") : [];
  if (parts.length === 1)
    return left
      .concat(right)
      .map((char) => char.padStart(4, "0"))
      .join(":");
  const fillCount = 8 - left.length - right.length;
  const middle = Array.from({ length: Math.max(0, fillCount) }, () => "0000");
  return [...left, ...middle, ...right].map((char) => char.padStart(4, "0")).join(":");
}

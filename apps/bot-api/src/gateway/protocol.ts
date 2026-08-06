import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const GATEWAY_HEADERS = {
  server: "x-professor-server",
  timestamp: "x-professor-timestamp",
  requestId: "x-professor-request-id",
  version: "x-professor-gateway-version",
  signature: "x-professor-signature",
} as const;

export function bodySha256(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function canonicalRequest(params: {
  method: string;
  path: string;
  serverId: string;
  timestamp: string;
  requestId: string;
  gatewayVersion: string;
  bodyHash: string;
}): string {
  return [
    params.method.toUpperCase(),
    params.path,
    params.serverId,
    params.timestamp,
    params.requestId,
    params.gatewayVersion,
    params.bodyHash,
  ].join("\n");
}

export function signRequest(secret: string, canonical: string): string {
  return createHmac("sha256", Buffer.from(secret, "utf8")).update(canonical, "utf8").digest("hex");
}

export function safeSignatureCompare(expected: string, received: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bodySha256, canonicalRequest, signRequest } from "../src/gateway/protocol.js";

describe("contrato Gateway v1", () => {
  it("reproduz exatamente o vetor HMAC compartilhado", async () => {
    const fixturePath = fileURLToPath(
      new URL("../../../docs/contracts/gateway-v1.json", import.meta.url),
    );
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
      testOnlySecret: string;
      method: string;
      path: string;
      serverId: string;
      timestamp: string;
      requestId: string;
      gatewayVersion: string;
      body: string;
      bodySha256: string;
      signature: string;
    };
    const body = Buffer.from(fixture.body, "utf8");
    const hash = bodySha256(body);
    const canonical = canonicalRequest({
      method: fixture.method,
      path: fixture.path,
      serverId: fixture.serverId,
      timestamp: fixture.timestamp,
      requestId: fixture.requestId,
      gatewayVersion: fixture.gatewayVersion,
      bodyHash: hash,
    });
    expect(hash).toBe(fixture.bodySha256);
    expect(signRequest(fixture.testOnlySecret, canonical)).toBe(fixture.signature);
  });
});

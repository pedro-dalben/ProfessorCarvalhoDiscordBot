import { randomBytes } from "node:crypto";

function bytes(n: number): string {
  return randomBytes(n).toString("base64url");
}

console.log("=== Segredos para o Professor Carvalho ===\n");
console.log("CSA_SOURCE_TOKEN:      ", bytes(32));
console.log("METRICS_BEARER_TOKEN:   ", bytes(24));
console.log("GATEWAY_SHARED_SECRET:  ", bytes(32));
console.log("POSTGRES_PASSWORD:      ", bytes(18));
console.log("REDIS_PASSWORD:         ", bytes(18));
console.log("\nCopie os valores acima para o .env. NUNCA compartilhe ou commitar.");

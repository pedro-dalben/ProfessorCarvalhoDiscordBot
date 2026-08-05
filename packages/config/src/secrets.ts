import { randomBytes } from "node:crypto";

export function generateSourceToken(bytes = 32): string {
  if (bytes < 32) {
    throw new Error("O token de origem precisa ter pelo menos 32 bytes.");
  }
  return randomBytes(bytes).toString("base64url");
}

export function generateBearerToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateDatabasePassword(bytes = 18): string {
  return randomBytes(bytes).toString("base64url");
}

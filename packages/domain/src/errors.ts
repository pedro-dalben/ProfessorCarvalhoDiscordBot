export type ProfessorErrorCode =
  | "POKEMON_NOT_FOUND"
  | "POKEDEX_PROVIDER_UNAVAILABLE"
  | "SNAPSHOT_UNAVAILABLE"
  | "SNAPSHOT_INVALID"
  | "CSA_INVALID_PAYLOAD"
  | "CSA_INVALID_TOKEN"
  | "CSA_INVALID_SOURCE"
  | "DISCORD_DELIVERY_FAILED"
  | "DATABASE_UNAVAILABLE"
  | "REDIS_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class ProfessorError extends Error {
  public readonly code: ProfessorErrorCode;
  public readonly retryable: boolean;

  constructor(code: ProfessorErrorCode, message: string, options?: { retryable?: boolean }) {
    super(message);
    this.name = "ProfessorError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}

export function isRetryableHttpError(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export function mapHttpErrorToCode(status: number): ProfessorErrorCode {
  if (status === 404) return "POKEMON_NOT_FOUND";
  if (isRetryableHttpError(status)) return "POKEDEX_PROVIDER_UNAVAILABLE";
  return "POKEMON_NOT_FOUND";
}

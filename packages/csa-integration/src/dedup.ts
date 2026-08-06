import { sha256Hex, stableStringify, type SpawnAlertEvent } from "@bigbangcraft/domain";

export interface DedupStore {
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
}

export interface DedupOptions {
  store: DedupStore;
  windowSeconds: number;
  keyPrefix: string;
  /**
   * Política de falha quando o Redis está indisponível:
   * - `fail-open`  (padrão): aceita o evento mesmo sem deduplicar. Prefere
   *   nunca perder um alerta legítimo a suprimir duplicatas ocasionais.
   * - `fail-closed`: lança erro; o ingress retorna falha e o CSA registra o HTTP error.
   */
  onRedisFailure?: "fail-open" | "fail-closed";
}

export type AcquireResult = { accepted: boolean; fingerprint: string };

export class SpawnDedupService {
  private readonly options: DedupOptions;
  constructor(options: DedupOptions) {
    this.options = { onRedisFailure: "fail-open", ...options };
  }

  /**
   * Aquisição atômica (SET NX + TTL) da janela de deduplicação.
   * Retorna `accepted=false` para o segundo envio idêntico dentro da janela.
   */
  async acquire(event: SpawnAlertEvent): Promise<AcquireResult> {
    const fingerprint = buildDedupFingerprint(event, this.options.windowSeconds);
    const key = `${this.options.keyPrefix}dedup:${fingerprint}`;
    try {
      const acquired = await this.options.store.setNx(key, "1", this.options.windowSeconds + 10);
      return { accepted: acquired, fingerprint };
    } catch (error) {
      if (this.options.onRedisFailure === "fail-closed") {
        throw error;
      }
      return { accepted: true, fingerprint };
    }
  }
}

/**
 * Fingerprint semântico baseado exclusivamente em campos confirmados do JAR.
 *
 * Campos: serverId, dexNumber, espécie normalizada, nível, shiny, legendary,
 * mythical, ultraBeast, paradox, bucket, biome, coordenadas arredondadas (grade
 * de 32 blocos) e janela temporal.
 *
 * O UUID do Pokémon NÃO está disponível para o template de webhook do CSA
 * (confirmado na auditoria do JAR), portanto não entra no fingerprint.
 */
function buildDedupFingerprint(event: SpawnAlertEvent, windowSeconds: number): string {
  const receivedAt = event.receivedAt ? new Date(event.receivedAt).getTime() : Date.now();
  const windowBucket = Math.floor(receivedAt / 1000 / windowSeconds);

  const fields: Record<string, unknown> = {
    server: event.serverId,
    dex: event.dexNumber ?? 0,
    species: normalizeSpecies(event.species ?? event.displayName ?? ""),
    level: event.level ?? 0,
    shiny: event.shiny ?? false,
    legendary: event.legendary ?? false,
    mythical: event.mythical ?? false,
    ultraBeast: event.ultraBeast ?? false,
    paradox: event.paradox ?? false,
    bucket: (event.bucket ?? event.rarity ?? "").toLowerCase(),
    biome: (event.biome ?? "").toLowerCase(),
    window: windowBucket,
  };

  if (event.coordinates) {
    fields.x = roundCoordinate(event.coordinates.x);
    fields.y = roundCoordinate(event.coordinates.y);
    fields.z = roundCoordinate(event.coordinates.z);
  }

  return sha256Hex(stableStringify(fields));
}

function normalizeSpecies(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function roundCoordinate(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.round(value / 32);
}

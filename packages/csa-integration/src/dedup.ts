import { sha256Hex, stableStringify, type SpawnAlertEvent } from "@bigbangcraft/domain";

export interface DedupStore {
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
}

export interface DedupOptions {
  store: DedupStore;
  windowSeconds: number;
  keyPrefix: string;
}

export class SpawnDedupService {
  private readonly options: DedupOptions;
  constructor(options: DedupOptions) {
    this.options = options;
  }

  async isDuplicate(event: SpawnAlertEvent): Promise<boolean> {
    const fingerprint = buildDedupFingerprint(event, this.options.windowSeconds);
    const key = `${this.options.keyPrefix}dedup:${fingerprint}`;
    const acquired = await this.options.store.setNx(key, "1", this.options.windowSeconds + 10);
    return !acquired;
  }

  async markDuplicate(event: SpawnAlertEvent): Promise<void> {
    const fingerprint = buildDedupFingerprint(event, this.options.windowSeconds);
    const key = `${this.options.keyPrefix}dedup:${fingerprint}`;
    await this.options.store.setNx(key, "1", this.options.windowSeconds + 10);
  }
}

function buildDedupFingerprint(event: SpawnAlertEvent, windowSeconds: number): string {
  const windowBucket = Math.floor(new Date(event.receivedAt).getTime() / 1000 / windowSeconds);

  const fields: Record<string, unknown> = {
    server: event.serverId,
    dex: event.dexNumber ?? 0,
    level: event.level ?? 0,
    shiny: event.shiny ?? false,
    legendary: event.legendary ?? false,
    bucket: event.bucket ?? "",
    biome: event.biome ?? "",
    window: windowBucket,
  };

  if (event.coordinates) {
    fields.x = event.coordinates.x !== undefined ? Math.floor((event.coordinates.x ?? 0) / 32) : 0;
    fields.y = event.coordinates.y !== undefined ? Math.floor((event.coordinates.y ?? 0) / 32) : 0;
    fields.z = event.coordinates.z !== undefined ? Math.floor((event.coordinates.z ?? 0) / 32) : 0;
  }

  return sha256Hex(stableStringify(fields));
}

export function eventContentFingerprint(event: SpawnAlertEvent): string {
  return sha256Hex(
    stableStringify({
      server: event.serverId,
      dex: event.dexNumber,
      level: event.level,
      shiny: event.shiny,
      legendary: event.legendary,
      bucket: event.bucket,
      biome: event.biome,
      receivedAt: event.receivedAt,
    }),
  );
}

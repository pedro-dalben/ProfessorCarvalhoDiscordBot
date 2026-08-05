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

  async acquire(event: SpawnAlertEvent): Promise<boolean> {
    const fingerprint = buildDedupFingerprint(event, this.options.windowSeconds);
    const key = `${this.options.keyPrefix}dedup:${fingerprint}`;
    const acquired = await this.options.store.setNx(key, "1", this.options.windowSeconds + 10);
    return acquired;
  }
}

function buildDedupFingerprint(event: SpawnAlertEvent, windowSeconds: number): string {
  const windowBucket = Math.floor(new Date(event.receivedAt).getTime() / 1000 / windowSeconds);

  const fields: Record<string, unknown> = {
    server: event.serverId,
    dex: event.dexNumber ?? 0,
    species: event.species ?? "",
    level: event.level ?? 0,
    shiny: event.shiny ?? false,
    legendary: event.legendary ?? false,
    mythical: event.mythical ?? false,
    ultraBeast: event.ultraBeast ?? false,
    paradox: event.paradox ?? false,
    bucket: event.bucket ?? "",
    biome: event.biome ?? "",
    window: windowBucket,
  };

  if (event.coordinates) {
    fields.x = event.coordinates.x !== undefined ? Math.round((event.coordinates.x ?? 0) / 32) : 0;
    fields.y = event.coordinates.y !== undefined ? Math.round((event.coordinates.y ?? 0) / 32) : 0;
    fields.z = event.coordinates.z !== undefined ? Math.round((event.coordinates.z ?? 0) / 32) : 0;
  }

  return sha256Hex(stableStringify(fields));
}

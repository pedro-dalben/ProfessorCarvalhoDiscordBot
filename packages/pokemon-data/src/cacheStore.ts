export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
}

export type MinimalRedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  ping(): Promise<unknown>;
};

export class RedisKeyValueStore implements KeyValueStore {
  private readonly client: MinimalRedisLike;
  private readonly keyPrefix: string;

  constructor(client: MinimalRedisLike, keyPrefix: string) {
    this.client = client;
    this.keyPrefix = keyPrefix;
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(this.prefix(key));
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await this.client.set(this.prefix(key), value, "EX", Math.ceil(ttlSeconds));
    } else {
      await this.client.set(this.prefix(key), value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.prefix(key));
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return String(result).toUpperCase().includes("PONG");
    } catch {
      return false;
    }
  }

  private prefix(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}

export class InMemoryTtlCache implements KeyValueStore {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();

  private readonly maxEntries: number;
  constructor(maxEntries = 512) {
    this.maxEntries = maxEntries;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return await Promise.resolve(entry.value);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds !== undefined && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
    await Promise.resolve();
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
    await Promise.resolve();
  }

  async ping(): Promise<boolean> {
    return await Promise.resolve(true);
  }

  get size(): number {
    return this.store.size;
  }
}

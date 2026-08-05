import type { KeyValueStore } from "@bigbangcraft/pokemon-data";

export function createMemoryStore(): KeyValueStore & {
  clear(): void;
  memorySize(): number;
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
} {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return await Promise.resolve(entry.value);
    },
    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
      store.set(key, {
        value,
        expiresAt: ttlSeconds !== undefined ? Date.now() + ttlSeconds * 1000 : null,
      });
      await Promise.resolve();
    },
    /* eslint-disable-next-line @typescript-eslint/require-await */
    async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
      if (store.has(key)) {
        return false;
      }
      store.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return true;
    },
    async del(key: string): Promise<void> {
      store.delete(key);
      await Promise.resolve();
    },
    async ping(): Promise<boolean> {
      return await Promise.resolve(true);
    },
    clear(): void {
      store.clear();
    },
    memorySize(): number {
      return store.size;
    },
  };
}

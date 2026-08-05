import type { PokemonType } from "@bigbangcraft/domain";
import { normalizeName } from "@bigbangcraft/domain";
import type { KeyValueStore } from "./cacheStore.js";
import { InMemoryTtlCache } from "./cacheStore.js";
import type {
  EvolutionChain,
  PokemonDetails,
  PokemonProvider,
  TypeEffectiveness,
} from "./types.js";

const CACHE_VERSION = "pkm-v1";
const NEGATIVE_MARKER = "__PC_NOT_FOUND__";

export interface CacheMetricsSink {
  hit(cache: string): void;
  miss(cache: string): void;
}

export interface CachedProviderOptions {
  store: KeyValueStore;
  freshTtlSeconds: number;
  staleTtlSeconds: number;
  negativeTtlSeconds: number;
  typeFreshTtlSeconds?: number;
  memoryCache?: InMemoryTtlCache;
  metrics?: CacheMetricsSink;
}

interface CacheEnvelope<T> {
  payload: T;
  updatedAt: number;
}

export class CachedPokemonProvider implements PokemonProvider {
  private readonly memory: InMemoryTtlCache;
  private readonly inner: PokemonProvider;
  private readonly options: CachedProviderOptions;

  constructor(inner: PokemonProvider, options: CachedProviderOptions) {
    this.inner = inner;
    this.options = options;
    this.memory = options.memoryCache ?? new InMemoryTtlCache(256);
  }

  async findPokemon(query: string): Promise<PokemonDetails | null> {
    const key = `find:${normalizeName(query)}`;
    return this.withCache<PokemonDetails | null>(
      key,
      "pokemon",
      this.options.freshTtlSeconds,
      this.options.staleTtlSeconds,
      () => this.inner.findPokemon(query),
    );
  }

  async getTypeEffectiveness(type: PokemonType): Promise<TypeEffectiveness> {
    const key = `type:${type}`;
    const ttl = this.options.typeFreshTtlSeconds ?? 7 * 24 * 3600;
    const result = await this.withCache<TypeEffectiveness>(key, "type", ttl, ttl * 2, () =>
      this.inner.getTypeEffectiveness(type),
    );
    if (!result) {
      throw new Error("Falha inesperada ao resolver efetividade de tipo.");
    }
    return result;
  }

  async getEvolutionChain(speciesId: number): Promise<EvolutionChain | null> {
    const key = `evolution:${speciesId}`;
    return this.withCache<EvolutionChain | null>(
      key,
      "evolution",
      this.options.freshTtlSeconds,
      this.options.staleTtlSeconds,
      () => this.inner.getEvolutionChain(speciesId),
    );
  }

  private storageKey(key: string): string {
    return `${CACHE_VERSION}:${key}`;
  }

  private async withCache<T>(
    key: string,
    metricLabel: string,
    freshTtlSeconds: number,
    staleTtlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const fullKey = this.storageKey(key);

    const memoryHit = await this.memory.get(fullKey);
    if (memoryHit !== null) {
      const envelope = safeParseEnvelope<T>(memoryHit);
      if (envelope && isFresh(envelope, freshTtlSeconds)) {
        this.options.metrics?.hit("memory");
        return envelope.payload;
      }
    }

    const stored = await safeGet(this.options.store, fullKey);
    if (stored !== null) {
      const envelope = safeParseEnvelope<T>(stored);
      if (envelope && isFresh(envelope, freshTtlSeconds)) {
        this.options.metrics?.hit("redis");
        await this.memory.set(fullKey, stored, Math.max(30, freshTtlSeconds / 24));
        return envelope.payload;
      }
      if (envelope && isFresh(envelope, staleTtlSeconds)) {
        try {
          const fresh = await loader();
          await this.persist(fullKey, fresh, staleTtlSeconds);
          return fresh;
        } catch {
          this.options.metrics?.hit("stale");
          return envelope.payload;
        }
      }
    }

    this.options.metrics?.miss(metricLabel);
    try {
      const fresh = await loader();
      if (fresh === null) {
        await this.memory.set(fullKey, NEGATIVE_MARKER, this.options.negativeTtlSeconds);
        await safeSet(
          this.options.store,
          fullKey,
          NEGATIVE_MARKER,
          this.options.negativeTtlSeconds,
        );
        return fresh;
      }
      await this.persist(fullKey, fresh, staleTtlSeconds);
      return fresh;
    } catch (error) {
      const stale = await safeGet(this.options.store, fullKey);
      if (stale !== null && stale !== NEGATIVE_MARKER) {
        const envelope = safeParseEnvelope<T>(stale);
        if (envelope) {
          this.options.metrics?.hit("stale");
          return envelope.payload;
        }
      }
      throw error;
    }
  }

  private async persist<T>(fullKey: string, payload: T, ttlSeconds: number): Promise<void> {
    const envelope: CacheEnvelope<T> = { payload, updatedAt: Date.now() };
    const serialized = JSON.stringify(envelope);
    await this.memory.set(fullKey, serialized, Math.max(30, ttlSeconds / 24));
    await safeSet(this.options.store, fullKey, serialized, ttlSeconds);
  }
}

function isFresh(envelope: CacheEnvelope<unknown>, ttlSeconds: number): boolean {
  return Date.now() - envelope.updatedAt < ttlSeconds * 1000;
}

function safeParseEnvelope<T>(raw: string): CacheEnvelope<T> | null {
  if (raw === NEGATIVE_MARKER) {
    return { payload: null as T, updatedAt: Date.now() };
  }
  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (typeof parsed !== "object" || parsed === null || !("updatedAt" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function safeGet(store: KeyValueStore, key: string): Promise<string | null> {
  try {
    return await store.get(key);
  } catch {
    return null;
  }
}

async function safeSet(
  store: KeyValueStore,
  key: string,
  value: string,
  ttl: number,
): Promise<void> {
  try {
    await store.set(key, value, ttl);
  } catch {
    return;
  }
}

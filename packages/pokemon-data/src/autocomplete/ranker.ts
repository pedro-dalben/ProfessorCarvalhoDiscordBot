import { normalizeName } from "@bigbangcraft/domain";

export interface AutocompleteIndexEntry {
  name: string;
  species: string;
  dex: number;
  form?: string;
  displayName: string;
  namePt?: string;
}

export interface AutocompleteIndex {
  version: number;
  generatedAt: string;
  entries: AutocompleteIndexEntry[];
}

export interface RankedChoice {
  entry: AutocompleteIndexEntry;
  score: number;
}

export const AUTOCOMPLETE_MAX_CHOICES = 25;

interface ScoredBucket {
  exactCanonical: RankedChoice[];
  exactNormalized: RankedChoice[];
  prefix: RankedChoice[];
  tokenPrefix: RankedChoice[];
  fuzzy: RankedChoice[];
}

export class AutocompleteRanker {
  private readonly byNormalized = new Map<string, AutocompleteIndexEntry[]>();

  private readonly index: AutocompleteIndex;
  constructor(index: AutocompleteIndex) {
    this.index = index;
    for (const entry of index.entries) {
      const key = normalizeName(entry.name);
      const existing = this.byNormalized.get(key);
      if (existing) {
        existing.push(entry);
      } else {
        this.byNormalized.set(key, [entry]);
      }
    }
  }

  get entryCount(): number {
    return this.index.entries.length;
  }

  search(query: string, limit = AUTOCOMPLETE_MAX_CHOICES): RankedChoice[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const normalized = normalizeName(trimmed);
    if (!normalized) return [];

    const buckets: ScoredBucket = {
      exactCanonical: [],
      exactNormalized: [],
      prefix: [],
      tokenPrefix: [],
      fuzzy: [],
    };

    for (const entry of this.index.entries) {
      const entryNormalized = normalizeName(entry.name);
      const aliasNormalized = entry.namePt ? normalizeName(entry.namePt) : undefined;

      if (
        entryNormalized === trimmed.toLowerCase() ||
        entry.name.toLowerCase() === trimmed.toLowerCase()
      ) {
        buckets.exactCanonical.push({ entry, score: 0 });
        continue;
      }
      if (entryNormalized === normalized || aliasNormalized === normalized) {
        buckets.exactNormalized.push({ entry, score: 1 });
        continue;
      }
      if (entryNormalized.startsWith(normalized)) {
        buckets.prefix.push({ entry, score: 2 });
        continue;
      }
      const tokens = entryNormalized.split("-");
      if (
        tokens.some((token) => token.startsWith(normalized)) ||
        aliasNormalized?.startsWith(normalized)
      ) {
        buckets.tokenPrefix.push({ entry, score: 3 });
        continue;
      }
      if (normalized.length >= 4) {
        const threshold = normalized.length >= 8 ? 2 : 1;
        if (distanceWithin(entryNormalized, normalized, threshold)) {
          buckets.fuzzy.push({ entry, score: 4 });
        }
      }
    }

    const ordered = [
      ...sortByRank(buckets.exactCanonical),
      ...sortByRank(buckets.exactNormalized),
      ...sortByRank(buckets.prefix),
      ...sortByRank(buckets.tokenPrefix),
      ...sortByRank(buckets.fuzzy),
    ];

    const seen = new Set<string>();
    const results: RankedChoice[] = [];
    for (const choice of ordered) {
      const key = choice.entry.name;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(choice);
      if (results.length >= limit) break;
    }
    return results;
  }
}

export function loadAutocompleteIndex(raw: unknown): AutocompleteIndex {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Índice de autocomplete vazio ou inválido.");
  }
  const candidate = raw as Partial<AutocompleteIndex>;
  const version = candidate.version;
  const generatedAt = candidate.generatedAt;
  const entries = candidate.entries;
  if (typeof version !== "number" || typeof generatedAt !== "string" || !Array.isArray(entries)) {
    throw new Error("Índice de autocomplete com estrutura inesperada.");
  }
  for (const entry of entries) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.name !== "string" ||
      typeof entry.species !== "string" ||
      typeof entry.dex !== "number" ||
      typeof entry.displayName !== "string"
    ) {
      throw new Error("Entrada de índice de autocomplete inválida.");
    }
  }
  return { version, generatedAt, entries: entries };
}

function sortByRank(choices: RankedChoice[]): RankedChoice[] {
  return choices.sort((a, b) => {
    const dexCompare = a.entry.dex - b.entry.dex;
    if (dexCompare !== 0) return dexCompare;
    return a.entry.name.localeCompare(b.entry.name);
  });
}

function distanceWithin(a: string, b: string, threshold: number): boolean {
  if (Math.abs(a.length - b.length) > threshold) return false;
  const previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const value = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > threshold) return false;
    previous.splice(0, previous.length, ...current);
  }
  return (previous[b.length] ?? 0) <= threshold;
}

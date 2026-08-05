import {
  ProfessorError,
  isPokemonType,
  isRetryableHttpError,
  normalizeName,
  type PokemonType,
} from "@bigbangcraft/domain";
import type { ZodType } from "zod";
import { evolutionChainSchema, pokemonSchema, speciesSchema, typeSchema } from "./schemas.js";
import type { EvolutionChainNode } from "./schemas.js";
import type {
  AbilityInfo,
  EvolutionChain,
  EvolutionStageInfo,
  PokemonDetails,
  PokemonProvider,
  TypeEffectiveness,
} from "./types.js";
import { officialArtworkUrl } from "./types.js";
import { displayNameFor } from "./displayNames.js";

export interface PokeApiHttpOptions {
  baseUrl: string;
  timeoutMs: number;
  userAgent: string;
  fetchImpl?: typeof fetch;
}

interface FetchOutcome<T> {
  status: number;
  data?: T;
}

export class PokeApiClient implements PokemonProvider {
  private readonly options: PokeApiHttpOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PokeApiHttpOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async findPokemon(query: string): Promise<PokemonDetails | null> {
    const normalized = normalizeName(query);
    if (!normalized) return null;

    const species = await this.resolveSpecies(normalized);
    if (!species) return null;

    const pokemonIdentifier = this.selectPokemonResource(species, normalized);
    const pokemon = await this.fetchJson(
      `/pokemon/${encodeURIComponent(pokemonIdentifier)}`,
      pokemonSchema,
    );
    if (!pokemon) return null;

    const evolutionId = await this.extractEvolutionChainId(species.evolution_chain?.url);
    let evolutionSummary: EvolutionStageInfo[] = [];
    if (evolutionId) {
      const chain = await this.getEvolutionChain(evolutionId);
      evolutionSummary = chain ? flattenChain(chain) : [];
    }

    const typeNames: PokemonType[] = [];
    for (const entry of [...pokemon.types].sort((a, b) => a.slot - b.slot)) {
      const typeName = entry.type.name.toLowerCase();
      if (isPokemonType(typeName)) typeNames.push(typeName);
    }

    const stats = {
      hp: 0,
      attack: 0,
      defense: 0,
      specialAttack: 0,
      specialDefense: 0,
      speed: 0,
    };
    for (const entry of pokemon.stats) {
      switch (entry.stat.name) {
        case "hp":
          stats.hp = entry.base_stat;
          break;
        case "attack":
          stats.attack = entry.base_stat;
          break;
        case "defense":
          stats.defense = entry.base_stat;
          break;
        case "special-attack":
          stats.specialAttack = entry.base_stat;
          break;
        case "special-defense":
          stats.specialDefense = entry.base_stat;
          break;
        case "speed":
          stats.speed = entry.base_stat;
          break;
        default:
          break;
      }
    }

    const abilities: AbilityInfo[] = [...pokemon.abilities]
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => ({
        name: entry.ability.name,
        displayName: displayNameFor(entry.ability.name),
        hidden: entry.is_hidden,
        slot: entry.slot,
      }));

    return {
      id: pokemon.id,
      name: pokemon.name,
      speciesIdentifier: species.name,
      displayName: displayNameFor(pokemon.name),
      namePtBr: pickLanguageName(species.names, "pt"),
      dexNumber: species.id,
      form:
        pokemon.name !== species.name ? pokemon.name.replace(`${species.name}-`, "") : undefined,
      types: typeNames,
      baseStats: stats,
      heightM: pokemon.height / 10,
      weightKg: pokemon.weight / 10,
      abilities,
      captureRate: species.capture_rate,
      flavorText: pickFlavorText(species),
      spriteUrl: officialArtworkUrl(species.id),
      evolutionSummary,
      isLegendary: species.is_legendary,
      isMythical: species.is_mythical,
    };
  }

  async getTypeEffectiveness(type: PokemonType): Promise<TypeEffectiveness> {
    const data = await this.fetchJson(`/type/${encodeURIComponent(type)}`, typeSchema);
    if (!data) {
      throw new ProfessorError(
        "POKEDEX_PROVIDER_UNAVAILABLE",
        "Tipo não encontrado na fonte externa.",
      );
    }
    const normalizeList = (entries: Array<{ name: string }>): PokemonType[] =>
      entries.map((entry) => entry.name.toLowerCase()).filter(isPokemonType);
    return {
      type,
      weakTo: normalizeList(data.damage_relations.double_damage_from),
      resistTo: normalizeList(data.damage_relations.half_damage_from),
      immuneTo: normalizeList(data.damage_relations.no_damage_from),
    };
  }

  async getEvolutionChain(speciesId: number): Promise<EvolutionChain | null> {
    const data = await this.fetchJson(`/evolution-chain/${speciesId}`, evolutionChainSchema);
    if (!data) return null;
    return { id: data.id, stages: collectStagePaths(data.chain) };
  }

  private async resolveSpecies(normalized: string) {
    const candidates = candidateSpeciesIdentifiers(normalized);
    for (const candidate of candidates) {
      const species = await this.fetchJson(
        `/pokemon-species/${encodeURIComponent(candidate)}`,
        speciesSchema,
      );
      if (species) return species;
    }
    return null;
  }

  private selectPokemonResource(
    species: { name: string; varieties: Array<{ is_default: boolean; pokemon: { name: string } }> },
    normalizedQuery: string,
  ): string {
    const varieties = species.varieties;
    if (varieties.length > 0) {
      const exact = varieties.find(
        (variety) => normalizeName(variety.pokemon.name) === normalizedQuery,
      );
      if (exact) return exact.pokemon.name;
      const fallback = varieties.find((variety) => variety.is_default);
      if (fallback) return fallback.pokemon.name;
      return varieties[0]?.pokemon.name ?? species.name;
    }
    return species.name;
  }

  private async extractEvolutionChainId(url: string | undefined): Promise<number | undefined> {
    if (!url) return undefined;
    const match = /\/evolution-chain\/(\d+)\/?$/.exec(url);
    if (!match || !match[1]) return undefined;
    const id = Number.parseInt(match[1], 10);
    return await Promise.resolve(Number.isFinite(id) ? id : undefined);
  }

  private async fetchJson<T>(path: string, schema: ZodType<T>): Promise<T | null> {
    const url = `${this.options.baseUrl.replace(/\/$/, "")}${path}`;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const outcome = await this.fetchOnce<T>(url, schema);
        if (outcome.status === 404) return null;
        if (outcome.status >= 200 && outcome.status < 300 && outcome.data !== undefined) {
          return outcome.data;
        }
        if (isRetryableHttpError(outcome.status) && attempt === 0) {
          lastError = new ProfessorError(
            "POKEDEX_PROVIDER_UNAVAILABLE",
            `Fonte externa respondeu com status ${outcome.status}.`,
            { retryable: true },
          );
          continue;
        }
        throw new ProfessorError(
          "POKEDEX_PROVIDER_UNAVAILABLE",
          `Fonte externa respondeu com status ${outcome.status}.`,
        );
      } catch (error) {
        if (error instanceof ProfessorError && !error.retryable) throw error;
        lastError = error;
        if (attempt === 0) continue;
      }
    }
    if (lastError instanceof ProfessorError) throw lastError;
    throw new ProfessorError(
      "POKEDEX_PROVIDER_UNAVAILABLE",
      "Não foi possível consultar a fonte externa de Pokémon.",
      { retryable: true },
    );
  }

  private async fetchOnce<T>(
    url: string,
    schema: ZodType<T>,
  ): Promise<FetchOutcome<T>> {
    const response = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(this.options.timeoutMs),
      headers: {
        "User-Agent": this.options.userAgent,
        Accept: "application/json",
      },
    });
    if (response.status === 404) {
      return { status: response.status };
    }
    if (!response.ok) {
      return { status: response.status };
    }
    const raw: unknown = await response.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ProfessorError(
        "POKEDEX_PROVIDER_UNAVAILABLE",
        "A resposta da fonte externa não passou na validação de segurança.",
      );
    }
    return { status: response.status, data: parsed.data };
  }
}

function candidateSpeciesIdentifiers(normalized: string): string[] {
  const candidates = [normalized];
  const lastHyphen = normalized.lastIndexOf("-");
  if (lastHyphen > 0) {
    const head = normalized.slice(0, lastHyphen);
    if (!candidates.includes(head)) candidates.push(head);
    const secondHyphen = head.lastIndexOf("-");
    if (secondHyphen > 0) {
      const head2 = head.slice(0, secondHyphen);
      if (!candidates.includes(head2)) candidates.push(head2);
    }
  }
  return candidates;
}

function pickLanguageName(
  names: Array<{ language: { name: string }; name: string }>,
  languagePrefix: string,
): string | undefined {
  const match = names.find((entry) => entry.language.name.startsWith(languagePrefix));
  return match?.name;
}

function pickFlavorText(species: {
  flavor_text_entries: Array<{ language: { name: string }; flavor_text: string }>;
}): string | undefined {
  const ptEntry = species.flavor_text_entries.find((entry) => entry.language.name.startsWith("pt"));
  const enEntry = species.flavor_text_entries.find((entry) => entry.language.name === "en");
  const chosen = ptEntry ?? enEntry;
  if (!chosen) return undefined;
  return chosen.flavor_text.replace(/[\n\r\f\v]+/g, " ").trim();
}

function collectStagePaths(node: EvolutionChainNode): EvolutionStageInfo[][] {
  if (node.evolves_to.length === 0) {
    return [[toStageInfo(node)]];
  }
  return node.evolves_to.flatMap((child) =>
    collectStagePaths(child).map((path) => [toStageInfo(node), ...path]),
  );
}

function flattenChain(chain: EvolutionChain): EvolutionStageInfo[] {
  const seen = new Set<string>();
  const flat: EvolutionStageInfo[] = [];
  for (const stage of chain.stages.flat()) {
    if (!seen.has(stage.speciesName)) {
      seen.add(stage.speciesName);
      flat.push(stage);
    }
  }
  return flat;
}

function toStageInfo(node: EvolutionChainNode): EvolutionStageInfo {
  const dex = /\/pokemon-species\/(\d+)\/?$/.exec(node.species.url);
  return {
    displayName: displayNameFor(node.species.name),
    speciesName: node.species.name,
    dexNumber: dex && dex[1] ? Number.parseInt(dex[1], 10) : undefined,
  };
}

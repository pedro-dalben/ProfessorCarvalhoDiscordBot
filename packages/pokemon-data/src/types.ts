import type { PokemonType } from "@bigbangcraft/domain";

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export interface AbilityInfo {
  name: string;
  displayName: string;
  hidden: boolean;
  slot: number;
}

export interface EvolutionStageInfo {
  displayName: string;
  speciesName: string;
  dexNumber?: number;
}

export interface PokemonDetails {
  id: number;
  name: string;
  speciesIdentifier: string;
  displayName: string;
  namePtBr?: string;
  dexNumber: number;
  form?: string;
  types: PokemonType[];
  baseStats: BaseStats;
  heightM: number;
  weightKg: number;
  abilities: AbilityInfo[];
  captureRate?: number;
  flavorText?: string;
  spriteUrl?: string;
  evolutionSummary: EvolutionStageInfo[];
  isLegendary: boolean;
  isMythical: boolean;
}

export interface TypeDamageRelations {
  doubleDamage: PokemonType[];
  halfDamage: PokemonType[];
  noDamage: PokemonType[];
}

export interface TypeEffectiveness {
  type: PokemonType;
  weakTo: PokemonType[];
  resistTo: PokemonType[];
  immuneTo: PokemonType[];
}

export interface EvolutionChain {
  id: number;
  stages: EvolutionStageInfo[][];
}

export interface StaleFallbackInfo {
  fromStaleCache: boolean;
}

export type PokemonLookupResult = PokemonDetails & StaleFallbackInfo;

export interface PokemonProvider {
  findPokemon(query: string): Promise<PokemonDetails | null>;
  getTypeEffectiveness(type: PokemonType): Promise<TypeEffectiveness>;
  getEvolutionChain(speciesId: number): Promise<EvolutionChain | null>;
}

export function officialArtworkUrl(dexNumber: number): string | undefined {
  if (!Number.isInteger(dexNumber) || dexNumber <= 0 || dexNumber > 20000) {
    return undefined;
  }
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexNumber}.png`;
}

import type { PokemonType } from "./pokemonTypes.js";
import { POKEMON_TYPES } from "./pokemonTypes.js";

type PartialChart = Partial<Record<PokemonType, number>>;

const EXCEPTIONS: Record<PokemonType, PartialChart> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: {
    fire: 0.5,
    water: 0.5,
    grass: 2,
    ice: 2,
    bug: 2,
    rock: 0.5,
    dragon: 0.5,
    steel: 2,
  },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: {
    fire: 0.5,
    water: 2,
    grass: 0.5,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    bug: 0.5,
    rock: 2,
    dragon: 0.5,
    steel: 0.5,
  },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: {
    normal: 2,
    ice: 2,
    poison: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2,
    ghost: 0,
    dark: 2,
    steel: 2,
    fairy: 0.5,
  },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: {
    fire: 2,
    electric: 2,
    grass: 0.5,
    poison: 2,
    flying: 0,
    bug: 0.5,
    rock: 2,
    steel: 2,
  },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: {
    fire: 0.5,
    grass: 2,
    fighting: 0.5,
    poison: 0.5,
    flying: 0.5,
    psychic: 2,
    ghost: 0.5,
    dark: 2,
    steel: 0.5,
    fairy: 0.5,
  },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

export function singleTypeMultiplier(attacker: PokemonType, defender: PokemonType): number {
  return EXCEPTIONS[attacker][defender] ?? 1;
}

export type EffectivenessMultiplier = 0 | 0.25 | 0.5 | 1 | 2 | 4;

export interface TypeInfo {
  attackingType: PokemonType;
  multiplier: EffectivenessMultiplier;
}

export interface TypeEffectivenessResult {
  multipliers: Record<EffectivenessMultiplier, PokemonType[]>;
}

function roundMultiplier(value: number): EffectivenessMultiplier {
  const known: readonly EffectivenessMultiplier[] = [0, 0.25, 0.5, 1, 2, 4];
  const rounded = Math.round(value * 100) / 100;
  for (const candidate of known) {
    if (Math.abs(candidate - rounded) < 0.0001) return candidate;
  }
  return 1;
}

export function calculateEffectiveness(defendingTypes: readonly PokemonType[]): TypeInfo[] {
  const results: TypeInfo[] = [];
  for (const attacker of POKEMON_TYPES) {
    let product = 1;
    for (const defender of defendingTypes) {
      product *= singleTypeMultiplier(attacker, defender);
    }
    results.push({ attackingType: attacker, multiplier: roundMultiplier(product) });
  }
  return results;
}

export function groupByMultiplier(infos: readonly TypeInfo[]): TypeEffectivenessResult {
  const groups: Record<EffectivenessMultiplier, PokemonType[]> = {
    0: [],
    0.25: [],
    0.5: [],
    1: [],
    2: [],
    4: [],
  };
  for (const info of infos) {
    groups[info.multiplier].push(info.attackingType);
  }
  return { multipliers: groups };
}

import { z } from "zod";

export const apiNameRef = z.object({
  name: z.string(),
  url: z.string().optional(),
});

export const speciesSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  is_legendary: z.boolean(),
  is_mythical: z.boolean(),
  capture_rate: z.number().int().min(0).max(255),
  evolution_chain: z.object({ url: z.url() }).nullable(),
  names: z.array(
    z.object({
      language: z.object({ name: z.string() }),
      name: z.string(),
    }),
  ),
  genera: z
    .array(
      z.object({
        language: z.object({ name: z.string() }),
        genus: z.string(),
      }),
    )
    .default([]),
  flavor_text_entries: z
    .array(
      z.object({
        language: z.object({ name: z.string() }),
        flavor_text: z.string(),
      }),
    )
    .default([]),
  varieties: z
    .array(
      z.object({
        is_default: z.boolean(),
        pokemon: apiNameRef,
      }),
    )
    .default([]),
});

export const statNames = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
] as const;

export const pokemonSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  height: z.number(),
  weight: z.number(),
  stats: z
    .array(
      z.object({
        base_stat: z.number().int(),
        stat: z.object({ name: z.string() }),
      }),
    )
    .default([]),
  types: z
    .array(
      z.object({
        slot: z.number().int(),
        type: z.object({ name: z.string() }),
      }),
    )
    .default([]),
  abilities: z
    .array(
      z.object({
        slot: z.number().int(),
        is_hidden: z.boolean(),
        ability: z.object({ name: z.string() }),
      }),
    )
    .default([]),
});

export const typeSchema = z.object({
  name: z.string(),
  damage_relations: z.object({
    double_damage_from: z.array(apiNameRef).default([]),
    half_damage_from: z.array(apiNameRef).default([]),
    no_damage_from: z.array(apiNameRef).default([]),
  }),
});

const evolutionSpeciesRef = z.object({
  species: z.object({ name: z.string(), url: z.string() }),
});

const evolutionDetails = z.object({
  min_level: z.number().int().nullable().optional(),
});

export interface EvolutionChainNode {
  species: { name: string; url: string };
  evolves_to: EvolutionChainNode[];
  evolution_details?: Array<{ min_level?: number | null }>;
}

const evolutionChainNode: z.ZodType<EvolutionChainNode> = z.lazy(() =>
  z.object({
    species: evolutionSpeciesRef.shape.species,
    evolves_to: z.array(evolutionChainNode).default([]),
    evolution_details: z.array(evolutionDetails).optional(),
  }),
);

export const evolutionChainSchema = z.object({
  id: z.number().int().positive(),
  chain: evolutionChainNode,
});

export type PokeApiSpecies = z.infer<typeof speciesSchema>;
export type PokeApiPokemon = z.infer<typeof pokemonSchema>;
export type PokeApiType = z.infer<typeof typeSchema>;

export function dexNumberFromSpeciesUrl(url: string): number | undefined {
  const match = /\/pokemon-species\/(\d+)\/?$/.exec(url);
  if (!match || !match[1]) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/* eslint-disable no-console */
/**
 * Gera o índice de autocomplete de Pokémon a partir da PokeAPI.
 *
 * Uso:
 *   pnpm data:generate-pokemon-index
 *
 * Saída:
 *   data/generated/pokemon-index.json (gitignored)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { displayNameFor } from "@bigbangcraft/pokemon-data";

interface PokemonListEntry {
  name: string;
  url: string;
}

const POKEAPI_BASE_URL = process.env.POKEAPI_BASE_URL ?? "https://pokeapi.co/api/v2";
const POKEAPI_USER_AGENT = process.env.POKEAPI_USER_AGENT ?? "ProfessorCarvalho/0.1.0 BigMonCraft";
const OUT_PATH = process.env.AUTOCOMPLETE_INDEX_PATH ?? "data/generated/pokemon-index.json";

async function fetchAllPokemon(): Promise<PokemonListEntry[]> {
  const url = `${POKEAPI_BASE_URL}/pokemon?limit=100000`;
  const response = await fetch(url, {
    headers: { "user-agent": POKEAPI_USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Falha ao buscar lista de Pokémon: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { results?: PokemonListEntry[] };
  if (!body.results) {
    throw new Error("Resposta da PokeAPI sem lista de resultados.");
  }
  return body.results;
}

async function main(): Promise<void> {
  const results = await fetchAllPokemon();
  const entries = results
    .map((entry) => {
      const match = /\/pokemon\/(\d+)\/?$/.exec(entry.url);
      const dex = match ? Number(match[1]) : 0;
      const name = entry.name;
      return { name, species: name, dex, displayName: displayNameFor(name) };
    })
    .sort((a, b) => a.dex - b.dex);

  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries,
  };

  const outFile = path.resolve(process.cwd(), OUT_PATH);
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(`Índice de autocomplete gerado: ${entries.length} entradas -> ${outFile}`);
}

main().catch((error) => {
  console.error("Falha ao gerar índice de autocomplete:", error);
  process.exit(1);
});

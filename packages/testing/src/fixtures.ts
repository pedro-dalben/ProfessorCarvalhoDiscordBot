import type { CsaWebhookPayload } from "@bigbangcraft/csa-integration";
import { buildMarkerTemplate } from "@bigbangcraft/csa-integration";
import type { SpawnAlertEvent } from "@bigbangcraft/domain";

/**
 * Gera um payload exatamente como o CSA 1.13.2 envia:
 * - booleanos como strings do JAR: "Shiny " (com espaço) / "" para shiny;
 *   "Legendary" | "Mythical" | "Ultra Beast" | "Paradox" / "" para rarity;
 *   "Hidden Ability " / "" para hidden ability;
 * - timestamp em MILISSEGUNDOS (System.currentTimeMillis()).
 */
export function createCsaFixture(
  overrides?: Partial<{
    dex: number;
    level: number;
    x: number;
    y: number;
    z: number;
    biome: string;
    bucket: string;
    shiny: boolean;
    legendary: boolean;
    mythical: boolean;
    ultraBeast: boolean;
    paradox: boolean;
    hiddenAbility: boolean;
    name: string;
    player: string;
    timestamp: number;
  }>,
): CsaWebhookPayload {
  const rarityValue = overrides?.legendary
    ? "Legendary"
    : overrides?.mythical
      ? "Mythical"
      : overrides?.ultraBeast
        ? "Ultra Beast"
        : overrides?.paradox
          ? "Paradox"
          : "";

  const marker = buildMarkerTemplate()
    .replace("{dex_unformatted}", String(overrides?.dex ?? 25))
    .replace("{level_unformatted}", String(overrides?.level ?? 50))
    .replace("{x}", String(overrides?.x ?? 1234))
    .replace("{y}", String(overrides?.y ?? 64))
    .replace("{z}", String(overrides?.z ?? -567))
    .replace("{biome_unformatted}", overrides?.biome ?? "Savanna Plateau")
    .replace("{bucket_unformatted}", overrides?.bucket ?? "Ultra Rare")
    .replace("{shiny_unformatted}", overrides?.shiny ? "Shiny " : "")
    .replace("{legendary_unformatted}", rarityValue)
    .replace("{hidden_ability_unformatted}", overrides?.hiddenAbility ? "Hidden Ability " : "")
    .replace("{name}", overrides?.name ?? "Pikachu")
    .replace("{nearest_player_unformatted}", overrides?.player ?? "TreinadorTeste")
    .replace("{timestamp}", String(overrides?.timestamp ?? Date.now()));

  return {
    content: marker,
    username: "Professor Carvalho",
    embeds: [],
  };
}

export function createMalformedPayload(): unknown {
  return { not_content: true, something: "wrong" };
}

export function createOversizedPayload(): string {
  return "x".repeat(100_000);
}

export function createDuplicateFixture(): CsaWebhookPayload {
  return createCsaFixture({ dex: 25, level: 50, x: 1234, z: -567 });
}

export function sanitizedSpawnAlertEvent(overrides?: Partial<SpawnAlertEvent>): SpawnAlertEvent {
  return {
    source: "csa",
    sourceVersion: "1.13.2",
    serverId: "test-server",
    receivedAt: new Date().toISOString(),
    dexNumber: 25,
    displayName: "Pikachu",
    level: 50,
    shiny: false,
    legendary: false,
    bucket: "Ultra Rare",
    biome: "Savanna Plateau",
    coordinates: { x: 1234, y: 64, z: -567 },
    ...overrides,
  };
}

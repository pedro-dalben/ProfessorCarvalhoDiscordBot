import type { CsaWebhookPayload } from "@bigbangcraft/csa-integration";
import { buildMarkerTemplate } from "@bigbangcraft/csa-integration";
import type { SpawnAlertEvent } from "@bigbangcraft/domain";

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
    name: string;
    player: string;
    timestamp: number;
  }>,
): CsaWebhookPayload {
  const marker = buildMarkerTemplate()
    .replace("{dex_unformatted}", String(overrides?.dex ?? 25))
    .replace("{level_unformatted}", String(overrides?.level ?? 50))
    .replace("{x}", String(overrides?.x ?? 1234))
    .replace("{y}", String(overrides?.y ?? 64))
    .replace("{z}", String(overrides?.z ?? -567))
    .replace("{biome_unformatted}", overrides?.biome ?? "Savanna Plateau")
    .replace("{bucket_unformatted}", overrides?.bucket ?? "ULTRA_RARE")
    .replace("{shiny_unformatted}", overrides?.shiny ? "Shiny " : " ")
    .replace("{legendary_unformatted}", overrides?.legendary ? "Legendary " : " ")
    .replace("{mythical_unformatted}", overrides?.mythical ? "Mythical " : " ")
    .replace("{ultrabeast_unformatted}", " ")
    .replace("{paradox_unformatted}", " ")
    .replace("{hidden_ability_unformatted}", " ")
    .replace("{name}", overrides?.name ?? "Pikachu")
    .replace("{nearest_player_unformatted}", overrides?.player ?? "Steve")
    .replace("{timestamp}", String(overrides?.timestamp ?? Math.floor(Date.now() / 1000)));

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
    bucket: "ULTRA_RARE",
    biome: "Savanna Plateau",
    coordinates: { x: 1234, y: 64, z: -567 },
    ...overrides,
  };
}

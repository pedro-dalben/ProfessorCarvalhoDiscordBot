import { sha256Hex } from "./fingerprint.js";

export const GAME_EVENT_SOURCES = [
  "gateway",
  "bigbang-spawn-alerts",
  "bigbangessentials",
  "system",
] as const;

export type GameEventSource = (typeof GAME_EVENT_SOURCES)[number];

export const GAME_EVENT_TYPES = [
  "player.session.started",
  "player.session.ended",
  "player.profile.snapshot",
  "pokemon.rare.spawned",
  "pokemon.rare.in_battle",
  "pokemon.rare.captured",
  "pokemon.rare.defeated",
  "pokemon.rare.despawned",
  "pokemon.capture.completed",
  "pokemon.evolution.completed",
  "pokemon.trade.completed",
] as const;

export type GameEventType = (typeof GAME_EVENT_TYPES)[number];

export interface GameEvent<T = unknown> {
  eventId: string;
  eventType: GameEventType;
  schemaVersion: string;
  serverId: string;
  occurredAt: Date;
  receivedAt: Date;
  minecraftUuid?: string;
  identityLinkId?: string;
  source: GameEventSource;
  sourceEventId?: string;
  payload: T;
}

export interface GameEventRow {
  id: string;
  eventId: string;
  eventType: string;
  schemaVersion: string;
  serverId: string;
  source: string;
  sourceEventId: string | null;
  minecraftUuid: string | null;
  identityLinkId: string | null;
  occurredAt: Date;
  receivedAt: Date;
  payload: unknown;
  backfilled: boolean | null;
  createdAt: Date | null;
}

export function gameEventIdempotencyKey(event: Pick<GameEvent, "source" | "sourceEventId">): string {
  const input = `${event.source}:${event.sourceEventId ?? ""}`;
  return sha256Hex(input);
}

export function isTerminalLifecycleStatus(status: string): boolean {
  return ["CAPTURED", "DEFEATED", "DESPAWNED", "REMOVED"].includes(status);
}

export const JOURNEY_ENTRY_TYPES = [
  "capture",
  "shiny_capture",
  "legendary_capture",
  "mythical_capture",
  "evolution",
  "first_capture",
  "first_shiny",
  "first_legendary",
  "pokedex_milestone",
  "rare_encountered",
  "rare_captured",
  "rare_defeated",
  "rare_despawned",
] as const;

export type JourneyEntryType = (typeof JOURNEY_ENTRY_TYPES)[number];

export interface CapturePayload {
  species: string;
  form?: string;
  dexNumber?: number;
  level?: number;
  shiny: boolean;
  legendary: boolean;
  mythical: boolean;
  spawnAlertId?: string;
  ball?: string;
}

export interface EvolutionPayload {
  fromSpecies: string;
  toSpecies: string;
  form?: string;
}

export interface RareSpawnPayload {
  species: string;
  form?: string;
  dexNumber?: number;
  level?: number;
  shiny: boolean;
  legendary: boolean;
  mythical: boolean;
  ultraBeast: boolean;
  paradox: boolean;
  rarity?: string;
  spawnAlertId: string;
  timeToCapture?: number;
  playerName?: string;
}

export interface PokedexMilestonePayload {
  caught: number;
  total: number;
  percentage: number;
}

export type JourneyPayload =
  | CapturePayload
  | EvolutionPayload
  | RareSpawnPayload
  | PokedexMilestonePayload
  | Record<string, unknown>;

export const POKEDEX_MILESTONES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

export function pokedexMilestoneForCount(caught: number, previous: number): number | null {
  for (const milestone of POKEDEX_MILESTONES) {
    if (caught >= milestone && previous < milestone) {
      return milestone;
    }
  }
  return null;
}

export interface PlayerJourneyStats {
  linkId: string;
  minecraftUuid: string;
  minecraftName: string;

  totalCaptures: number;
  uniqueSpeciesCaptured: number;
  shinyCaptures: number;
  legendaryCaptures: number;
  mythicalCaptures: number;
  rareCaptures: number;

  rareEncounters: number;
  rareDefeated: number;
  rareDespawned: number;

  totalPlaytime: number;
  sessions: number;

  evolutions: number;
  trades: number;

  firstSeenAt: Date | null;
  lastSeenAt: Date | null;

  mostCapturedSpecies: string | null;
  rarestCapturedSpecies: string | null;
  lastCapturedSpecies: string | null;
  lastShinySpecies: string | null;
  lastLegendarySpecies: string | null;

  fastestRareCaptureSeconds: number | null;
  totalRareCaptureTimeSeconds: number;
  rareCaptureCount: number;

  updatedAt: Date;
}

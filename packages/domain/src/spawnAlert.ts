import type { Coordinates } from "./coordinates.js";

export type SpawnAlertSource = "csa" | "gateway-fabric";

export interface SpawnAlertEvent {
  source: SpawnAlertSource;
  sourceVersion?: string;
  serverId: string;
  receivedAt: string;
  species?: string;
  displayName?: string;
  form?: string;
  dexNumber?: number;
  level?: number;
  shiny?: boolean;
  legendary?: boolean;
  mythical?: boolean;
  ultraBeast?: boolean;
  paradox?: boolean;
  hiddenAbility?: boolean;
  rarity?: string;
  bucket?: string;
  biome?: string;
  dimension?: string;
  coordinates?: Coordinates;
  nearestPlayer?: string;
  rawMessage?: string;
  parsedConfidence?: "high" | "medium" | "low";
}

export type SpawnAlertTier = "shiny" | "legendary" | "rare" | "standard";

export function classifySpawnAlertTier(event: SpawnAlertEvent): SpawnAlertTier {
  if (event.shiny) return "shiny";
  if (event.legendary || event.mythical || event.ultraBeast) return "legendary";
  const bucket = (event.bucket ?? event.rarity ?? "").toLowerCase();
  if (bucket === "ultra-rare" || bucket === "ultra_rare" || event.paradox) return "rare";
  return "standard";
}

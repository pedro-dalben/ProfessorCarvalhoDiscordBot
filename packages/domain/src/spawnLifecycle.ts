export type SpawnLifecycleStatus =
  | "SPAWNED"
  | "IN_BATTLE"
  | "CAPTURED"
  | "DEFEATED"
  | "DESPAWNED"
  | "REMOVED"
  | "UNKNOWN";

export type SpawnOrigin =
  | "NATURAL"
  | "COMMAND"
  | "SCRIPTED"
  | "EVENT"
  | "BREEDING"
  | "PLAYER_SENT_OUT"
  | "UNKNOWN";

export type LocationVisibility =
  | "EXACT"
  | "REGION"
  | "BIOME"
  | "WORLD_ONLY"
  | "HIDDEN";

export interface SpawnLifecycleEvent {
  spawnAlertId: string;
  serverId: string;
  status: SpawnLifecycleStatus;
  statusKey?: SpawnLifecycleStatus;

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

  spawnOrigin?: SpawnOrigin;

  worldKey?: string;
  worldDisplayName?: string;
  dimensionKey?: string;
  biome?: string;

  locationVisibility?: LocationVisibility;

  coordinates?: {
    x?: number;
    y?: number;
    z?: number;
    approximate?: boolean;
  };

  playerName?: string;

  alertReasons?: string[];
  matchedRuleIds?: string[];

  spawnedAt?: string;
  occurredAt?: string;
  resolvedAt?: string;
  elapsedTime?: string;
  resolvedTime?: string;

  parsedConfidence?: "high" | "medium" | "low";
}

export const SPWN_LIFECYCLE_STATUSES: readonly SpawnLifecycleStatus[] = [
  "SPAWNED",
  "IN_BATTLE",
  "CAPTURED",
  "DEFEATED",
  "DESPAWNED",
  "REMOVED",
  "UNKNOWN",
];

export const SPWN_TERMINAL_STATUSES: readonly SpawnLifecycleStatus[] = [
  "CAPTURED",
  "DEFEATED",
  "DESPAWNED",
  "REMOVED",
];

export const SPWN_ORIGINS: readonly SpawnOrigin[] = [
  "NATURAL",
  "COMMAND",
  "SCRIPTED",
  "EVENT",
  "BREEDING",
  "PLAYER_SENT_OUT",
  "UNKNOWN",
];

export const LOCATION_VISIBILITIES: readonly LocationVisibility[] = [
  "EXACT",
  "REGION",
  "BIOME",
  "WORLD_ONLY",
  "HIDDEN",
];

export function isTerminalStatus(status: SpawnLifecycleStatus): boolean {
  return (SPWN_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isLifecycleStatus(value: string): value is SpawnLifecycleStatus {
  return (SPWN_LIFECYCLE_STATUSES as readonly string[]).includes(value);
}

export function isSpawnOrigin(value: string): value is SpawnOrigin {
  return (SPWN_ORIGINS as readonly string[]).includes(value);
}

export function isLocationVisibility(value: string): value is LocationVisibility {
  return (LOCATION_VISIBILITIES as readonly string[]).includes(value);
}

export const STATUS_PT_BR_MAP: Record<string, SpawnLifecycleStatus> = {
  Disponivel: "SPAWNED",
  "Disponível": "SPAWNED",
  "Em batalha": "IN_BATTLE",
  Capturado: "CAPTURED",
  Derrotado: "DEFEATED",
  Desapareceu: "DESPAWNED",
  Removido: "REMOVED",
  Desconhecido: "UNKNOWN",
};

export function parseStatusFromPortuguese(text: string): SpawnLifecycleStatus | undefined {
  const normalized = text.toLowerCase().trim();
  for (const [pt, status] of Object.entries(STATUS_PT_BR_MAP)) {
    if (pt.toLowerCase() === normalized) {
      return status;
    }
  }
  return undefined;
}

export const ALLOWED_LIFECYCLE_TRANSITIONS: Record<SpawnLifecycleStatus, SpawnLifecycleStatus[]> = {
  SPAWNED: ["IN_BATTLE", "CAPTURED", "DEFEATED", "DESPAWNED", "REMOVED", "UNKNOWN"],
  IN_BATTLE: ["CAPTURED", "DEFEATED", "DESPAWNED", "REMOVED", "SPAWNED", "UNKNOWN"],
  CAPTURED: [],
  DEFEATED: [],
  DESPAWNED: [],
  REMOVED: [],
  UNKNOWN: ["SPAWNED", "IN_BATTLE", "CAPTURED", "DEFEATED", "DESPAWNED", "REMOVED"],
};

export function isTransitionAllowed(
  from: SpawnLifecycleStatus,
  to: SpawnLifecycleStatus,
): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_LIFECYCLE_TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}

export const LOCATION_VISIBILITY_SENSITIVITY: Record<LocationVisibility, number> = {
  HIDDEN: 0,
  WORLD_ONLY: 1,
  BIOME: 2,
  REGION: 3,
  EXACT: 4,
};

export function effectiveLocationVisibility(
  modVisibility: LocationVisibility,
  botPolicy: "hidden" | "region" | "exact_admin_only",
): LocationVisibility {
  const botEquivalent: LocationVisibility =
    botPolicy === "hidden"
      ? "HIDDEN"
      : botPolicy === "region"
        ? "REGION"
        : "EXACT";

  const modSensitivity = LOCATION_VISIBILITY_SENSITIVITY[modVisibility] ?? 0;
  const botSensitivity = LOCATION_VISIBILITY_SENSITIVITY[botEquivalent] ?? 0;

  const minSensitivity = Math.min(modSensitivity, botSensitivity);
  const entries = Object.entries(LOCATION_VISIBILITY_SENSITIVITY) as [LocationVisibility, number][];
  for (const [vis, sens] of entries) {
    if (sens === minSensitivity) return vis;
  }
  return "HIDDEN";
}

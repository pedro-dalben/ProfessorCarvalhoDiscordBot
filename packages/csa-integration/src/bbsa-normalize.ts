import type { SpawnLifecycleEvent } from "@bigbangcraft/domain";
import { parseBbsaMarker } from "./bbsa-marker.js";
import type { CsaWebhookPayload } from "./payload.js";

export interface BbsaNormalizeOptions {
  sourceVersion: string;
  serverId: string;
}

export type BbsaNormalizeResult =
  | { ok: true; event: SpawnLifecycleEvent }
  | { ok: false; code: "BBSA_MARKER_MISSING" | "BBSA_MARKER_UNPARSEABLE"; message: string };

export function normalizeBbsaEvent(
  payload: CsaWebhookPayload,
  options: BbsaNormalizeOptions,
): BbsaNormalizeResult {
  const marker = parseBbsaMarker(payload.content ?? undefined);

  if (!marker) {
    return {
      ok: false,
      code: "BBSA_MARKER_MISSING",
      message: "A notificação não contém o marcador PC_BBSA_V2 esperado do BigBangSpawnAlerts 1.14.0.",
    };
  }

  if (marker.confidence !== "high") {
    return {
      ok: false,
      code: "BBSA_MARKER_UNPARSEABLE",
      message: "O marcador PC_BBSA_V2 foi detectado, mas não pôde ser interpretado com segurança.",
    };
  }

  const event: SpawnLifecycleEvent = {
    spawnAlertId: marker.event.spawnAlertId ?? "unknown",
    serverId: options.serverId,
    status: marker.event.status ?? "SPAWNED",
    statusKey: marker.event.statusKey,
    species: marker.event.species,
    displayName: marker.event.displayName,
    form: marker.event.form,
    dexNumber: marker.event.dexNumber,
    level: marker.event.level,
    shiny: marker.event.shiny,
    rarity: marker.event.rarity ?? marker.event.bucket,
    bucket: marker.event.bucket,
    spawnOrigin: marker.event.spawnOrigin,
    worldKey: marker.event.worldKey,
    worldDisplayName: marker.event.worldDisplayName,
    dimensionKey: marker.event.dimensionKey,
    biome: marker.event.biome,
    locationVisibility: marker.event.locationVisibility,
    coordinates: marker.event.coordinates,
    playerName: marker.event.playerName,
    alertReasons: marker.event.alertReasons,
    matchedRuleIds: marker.event.matchedRuleIds,
    spawnedAt: marker.event.spawnedAt,
    occurredAt: marker.event.occurredAt,
    resolvedAt: marker.event.resolvedAt,
    elapsedTime: marker.event.elapsedTime,
    resolvedTime: marker.event.resolvedTime,
    parsedConfidence: "high",
  };

  return { ok: true, event };
}

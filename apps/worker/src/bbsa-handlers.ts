import type { DatabaseClient } from "@bigbangcraft/database";
import {
  createSpawnEvent,
  findIntegrationEventById,
  findSpawnEventById,
  findSpawnEventByIntegrationEventId,
  markEventFailed,
  markEventProcessed,
  markEventProcessing,
  findSpawnByExternalId,
  updateSpawnDiscordIds,
  claimSpawnEdit,
} from "@bigbangcraft/database";
import type { SpawnLifecycleEvent } from "@bigbangcraft/domain";
import type { AppConfig } from "@bigbangcraft/config";
import type { ProfessorMetrics } from "@bigbangcraft/observability";
import { buildBbsaLifecycleEmbed } from "@bigbangcraft/discord-ui";
import { buildAllowedMentions } from "@bigbangcraft/domain";
import type { DiscordSender } from "./handlers.js";

export interface ProcessBbsaJobData {
  eventId: string;
  sourceId: string;
  sourceVersion: string;
  serverId: string;
}

export interface DeliverBbsaJobData {
  spawnEventId: string;
  channelId: string;
  roleIds: string[];
  coordinatePolicy: "hidden" | "region" | "exact_admin_only";
  regionGridSize: number;
  serverAddress: string;
}

export interface EditBbsaJobData {
  spawnEventId: string;
  channelId: string;
  messageId: string;
  expectedRevision: number;
  coordinatePolicy: "hidden" | "region" | "exact_admin_only";
  regionGridSize: number;
  serverAddress: string;
}

export interface DiscordEditor extends DiscordSender {
  edit(
    channelId: string,
    messageId: string,
    body: { embeds: Array<Record<string, unknown>>; allowed_mentions: { parse: never[] } },
  ): Promise<void>;
}

export async function processBbsaJob(
  db: DatabaseClient,
  config: AppConfig,
  data: ProcessBbsaJobData,
  enqueueDelivery: (jobData: DeliverBbsaJobData) => Promise<void>,
): Promise<{ spawnEventId: string | null; skipped: boolean }> {
  const integrationEvent = await findIntegrationEventById(db, data.eventId);
  if (!integrationEvent) {
    throw new Error(`integration_event ${data.eventId} não encontrado.`);
  }

  await markEventProcessing(db, data.eventId);

  const stored = integrationEvent.normalizedPayload as SpawnLifecycleEvent | null;
  if (!stored || typeof stored !== "object") {
    await markEventFailed(db, data.eventId, "BBSA_NORMALIZED_PAYLOAD_MISSING");
    return { spawnEventId: null, skipped: true };
  }

  const existing = await findSpawnEventByIntegrationEventId(db, data.eventId);
  if (existing) {
    await markEventProcessed(db, data.eventId);
    return { spawnEventId: existing.id, skipped: true };
  }

  const duplicateCheck = await findSpawnByExternalId(db, config.BIGMONCRAFT_SERVER_ID, stored.spawnAlertId);
  if (duplicateCheck) {
    await markEventProcessed(db, data.eventId);
    return { spawnEventId: duplicateCheck.id, skipped: true };
  }

  const coordinateRegion = buildBbsaCoordinateRegion(stored, config);
  const spawnEvent = await createSpawnEvent(db, {
    integrationEventId: data.eventId,
    serverId: stored.serverId ?? data.serverId,
    externalSpawnAlertId: stored.spawnAlertId,
    species: stored.species ?? stored.displayName,
    form: stored.form,
    dexNumber: stored.dexNumber,
    level: stored.level,
    shiny: stored.shiny ?? false,
    legendary: stored.legendary ?? false,
    mythical: stored.mythical ?? false,
    ultraBeast: stored.ultraBeast ?? false,
    paradox: stored.paradox ?? false,
    rarity: stored.rarity,
    bucket: stored.bucket,
    biome: stored.biome,
    dimension: stored.dimensionKey,
    coordinateRegion,
    occurredAt: stored.spawnedAt ? new Date(stored.spawnedAt) : undefined,
    lifecycleStatus: stored.status ?? "SPAWNED",
    spawnOrigin: stored.spawnOrigin,
    worldKey: stored.worldKey,
    worldDisplayName: stored.worldDisplayName,
    dimensionKey: stored.dimensionKey,
    locationVisibility: stored.locationVisibility,
    alertReasons: stored.alertReasons,
    matchedRuleIds: stored.matchedRuleIds,
    involvedPlayerName: stored.playerName,
    spawnedAt: stored.spawnedAt ? new Date(stored.spawnedAt) : undefined,
  });

  await markEventProcessed(db, data.eventId);

  if (!spawnEvent) {
    return { spawnEventId: null, skipped: true };
  }

  const delivery = buildBbsaDeliveryPlan(stored, spawnEvent.id, config);
  if (delivery) {
    await enqueueDelivery(delivery);
  }

  return { spawnEventId: spawnEvent.id, skipped: false };
}

export async function deliverBbsaJob(
  db: DatabaseClient,
  sender: DiscordSender,
  metrics: ProfessorMetrics,
  config: AppConfig,
  data: DeliverBbsaJobData,
): Promise<{ delivered: boolean; discordMessageId: string | null }> {
  const spawnRow = await findSpawnEventById(db, data.spawnEventId);
  if (!spawnRow) {
    throw new Error(`spawn_event ${data.spawnEventId} não encontrado.`);
  }

  if (spawnRow.deliveryStatus === "delivered" && spawnRow.discordMessageId) {
    return { delivered: true, discordMessageId: spawnRow.discordMessageId };
  }

  const event: SpawnLifecycleEvent = spawnRowToLifecycleEvent(spawnRow);

  const embed = buildBbsaLifecycleEmbed(event, {
    coordinatePolicy: data.coordinatePolicy,
    regionGridSize: data.regionGridSize,
    showNearestPlayer: false,
    serverAddress: data.serverAddress,
    showOrigin: config.BBSA_SHOW_ORIGIN,
    showAlertReasons: config.BBSA_SHOW_ALERT_REASONS,
  });

  if (!embed) {
    return { delivered: false, discordMessageId: null };
  }

  const allowedMentions = buildAllowedMentions(data.roleIds);
  try {
    const response = await sender.send(data.channelId, {
      embeds: [embed],
      allowed_mentions: allowedMentions,
    });
    await updateSpawnDiscordIds(db, data.spawnEventId, {
      discordChannelId: data.channelId,
      discordMessageId: response.id,
    });
    metrics.spawnAlertDeliveredTotal
      .labels(classifyBbsaTier(event), config.BIGMONCRAFT_SERVER_ID)
      .inc();
    return { delivered: true, discordMessageId: response.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    metrics.spawnAlertFailedTotal.labels(classifyBbsaTier(event), "discord-error").inc();
    const deliveryError = new Error(`BBSA delivery failed: ${message}`);
    if (error instanceof Error) {
      deliveryError.cause = error;
    }
    throw deliveryError;
  }
}

export async function editBbsaJob(
  db: DatabaseClient,
  editor: DiscordEditor,
  metrics: ProfessorMetrics,
  config: AppConfig,
  data: EditBbsaJobData,
): Promise<{ edited: boolean }> {
  const claimed = await claimSpawnEdit(db, data.spawnEventId, data.expectedRevision);
  if (!claimed) {
    return { edited: false };
  }

  const embed = buildBbsaLifecycleEmbed(
    spawnRowToLifecycleEvent(claimed),
    {
      coordinatePolicy: data.coordinatePolicy,
      regionGridSize: data.regionGridSize,
      showNearestPlayer: false,
      serverAddress: data.serverAddress,
      showOrigin: config.BBSA_SHOW_ORIGIN,
      showAlertReasons: config.BBSA_SHOW_ALERT_REASONS,
    },
  );

  if (!embed) {
    return { edited: false };
  }

  try {
    await editor.edit(data.channelId, data.messageId, {
      embeds: [embed],
      allowed_mentions: { parse: [] },
    });
    return { edited: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("404") || message.includes("Unknown Message")) {
      if (config.BBSA_RECREATE_DELETED_MESSAGE) {
        const event = spawnRowToLifecycleEvent(claimed);
        const embed = buildBbsaLifecycleEmbed(event, {
          coordinatePolicy: data.coordinatePolicy,
          regionGridSize: data.regionGridSize,
          showNearestPlayer: false,
          serverAddress: data.serverAddress,
          showOrigin: config.BBSA_SHOW_ORIGIN,
          showAlertReasons: config.BBSA_SHOW_ALERT_REASONS,
        });
        if (embed) {
          try {
            const response = await editor.send(data.channelId, {
              embeds: [embed],
              allowed_mentions: { parse: [] },
            });
            await updateSpawnDiscordIds(db, data.spawnEventId, {
              discordChannelId: data.channelId,
              discordMessageId: response.id,
            });
            return { edited: true };
          } catch {
            metrics.spawnAlertFailedTotal
              .labels(classifyBbsaTier(event), "recreate-error")
              .inc();
          }
        }
      }
    }
    metrics.spawnAlertFailedTotal
      .labels(classifyBbsaTier(spawnRowToLifecycleEvent(claimed)), "edit-error")
      .inc();
    throw error;
  }
}

function spawnRowToLifecycleEvent(row: {
  serverId: string;
  species: string | null;
  form: string | null;
  dexNumber: number | null;
  level: number | null;
  shiny: boolean | null;
  legendary: boolean | null;
  mythical: boolean | null;
  ultraBeast: boolean | null;
  paradox: boolean | null;
  rarity: string | null;
  bucket: string | null;
  biome: string | null;
  dimension: string | null;
  coordinateRegion: string | null;
  lifecycleStatus: string | null;
  lifecycleRevision: number | null;
  spawnOrigin: string | null;
  worldKey: string | null;
  worldDisplayName: string | null;
  dimensionKey: string | null;
  locationVisibility: string | null;
  alertReasons: unknown;
  matchedRuleIds: unknown;
  involvedPlayerName: string | null;
  externalSpawnAlertId: string | null;
  spawnedAt: Date | string | null;
  resolvedAt: Date | string | null;
}): SpawnLifecycleEvent {
  return {
    spawnAlertId: row.externalSpawnAlertId ?? row.serverId,
    serverId: row.serverId,
    status: (row.lifecycleStatus as SpawnLifecycleEvent["status"]) ?? "SPAWNED",
    displayName: row.species ?? undefined,
    form: row.form ?? undefined,
    dexNumber: row.dexNumber ?? undefined,
    level: row.level ?? undefined,
    shiny: row.shiny ?? false,
    legendary: row.legendary ?? false,
    mythical: row.mythical ?? false,
    ultraBeast: row.ultraBeast ?? false,
    paradox: row.paradox ?? false,
    rarity: row.rarity ?? undefined,
    bucket: row.bucket ?? undefined,
    biome: row.biome ?? undefined,
    dimensionKey: row.dimensionKey ?? row.dimension ?? undefined,
    worldDisplayName: row.worldDisplayName ?? undefined,
    worldKey: row.worldKey ?? undefined,
    locationVisibility: row.locationVisibility as SpawnLifecycleEvent["locationVisibility"],
    spawnOrigin: row.spawnOrigin as SpawnLifecycleEvent["spawnOrigin"],
    playerName: row.involvedPlayerName ?? undefined,
    alertReasons: Array.isArray(row.alertReasons)
      ? (row.alertReasons as string[])
      : undefined,
    matchedRuleIds: Array.isArray(row.matchedRuleIds)
      ? row.matchedRuleIds
      : undefined,
    coordinates: parseRegionCoordinates(row.coordinateRegion ?? undefined),
    spawnedAt: row.spawnedAt
      ? new Date(row.spawnedAt).toISOString()
      : undefined,
    resolvedAt: row.resolvedAt
      ? new Date(row.resolvedAt).toISOString()
      : undefined,
  };
}

function buildBbsaCoordinateRegion(
  event: SpawnLifecycleEvent,
  config: AppConfig,
): string | undefined {
  if (config.SPAWN_COORDINATE_POLICY === "hidden") return undefined;
  const x = event.coordinates?.x;
  const z = event.coordinates?.z;
  if (x === undefined || z === undefined) return undefined;
  return `${Math.round(x)},${Math.round(z)}`;
}

function parseRegionCoordinates(region: string | undefined): SpawnLifecycleEvent["coordinates"] {
  if (!region) return undefined;
  const [x, z] = region.split(",").map((part) => Number.parseFloat(part));
  if (!Number.isFinite(x) || !Number.isFinite(z)) return undefined;
  return { x, z };
}

export function buildBbsaDeliveryPlan(
  event: SpawnLifecycleEvent,
  spawnEventId: string,
  config: AppConfig,
): DeliverBbsaJobData | null {
  const roleIds: string[] = [];
  if (event.shiny && config.DISCORD_SHINY_ALERT_ROLE_ID) {
    roleIds.push(config.DISCORD_SHINY_ALERT_ROLE_ID);
  }
  if (
    (event.legendary || event.mythical || event.ultraBeast || event.paradox) &&
    config.DISCORD_LEGENDARY_ALERT_ROLE_ID
  ) {
    roleIds.push(config.DISCORD_LEGENDARY_ALERT_ROLE_ID);
  }

  const policy = config.SPAWN_COORDINATE_POLICY;
  let channelId = config.DISCORD_SPAWN_ALERT_CHANNEL_ID;

  if (policy === "exact_admin_only") {
    if (!config.DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID) return null;
    channelId = config.DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID;
  }

  if (!channelId) return null;

  return {
    spawnEventId,
    channelId,
    roleIds,
    coordinatePolicy: policy,
    regionGridSize: config.SPAWN_REGION_GRID_SIZE,
    serverAddress: config.BIGMONCRAFT_SERVER_ADDRESS,
  };
}

function classifyBbsaTier(event: SpawnLifecycleEvent): string {
  if (event.shiny) return "shiny";
  if (event.legendary || event.mythical || event.ultraBeast) return "legendary";
  if (event.paradox) return "rare";
  return "standard";
}

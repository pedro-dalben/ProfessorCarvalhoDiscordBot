import type { DatabaseClient } from "@bigbangcraft/database";
import {
  createSpawnEvent,
  findIntegrationEventById,
  findSpawnEventById,
  findSpawnEventByIntegrationEventId,
  markEventFailed,
  markEventProcessed,
  markEventProcessing,
  claimSpawnDelivery,
  markSpawnDelivered,
  markSpawnDeliveryFailed,
} from "@bigbangcraft/database";
import type { SpawnAlertEvent } from "@bigbangcraft/domain";
import type { AppConfig } from "@bigbangcraft/config";
import type { ProfessorMetrics } from "@bigbangcraft/observability";
import { buildSpawnAlertEmbed } from "@bigbangcraft/discord-ui";
import { buildAllowedMentions } from "@bigbangcraft/domain";

export interface ProcessCsaJobData {
  eventId: string;
  sourceId: string;
  sourceVersion: string;
  serverId: string;
}

export interface DeliverJobData {
  spawnEventId: string;
  channelId: string;
  roleIds: string[];
  coordinatePolicy: "hidden" | "region" | "exact_admin_only";
  regionGridSize: number;
  serverAddress: string;
}

/** Contrato da fronteira externa do Discord (mockável nos testes e2e). */
export interface DiscordSender {
  send(
    channelId: string,
    body: {
      embeds: Array<Record<string, unknown>>;
      allowed_mentions: { parse: never[]; roles?: string[] };
    },
  ): Promise<{ id: string }>;
}

export interface ProcessResult {
  spawnEventId: string | null;
  skipped: boolean;
}

/**
 * Passo 1 do worker: carrega o integration_event persistido no ingress,
 * cria o spawn_event (idempotente pela unique constraint) e enfileira a
 * entrega. Nada é fabricado a partir de placeholders: apenas os dados
 * normalizados gravados pelo relay são usados.
 */
export async function processCsaJob(
  db: DatabaseClient,
  config: AppConfig,
  data: ProcessCsaJobData,
  enqueueDelivery: (jobData: DeliverJobData) => Promise<void>,
): Promise<ProcessResult> {
  const integrationEvent = await findIntegrationEventById(db, data.eventId);
  if (!integrationEvent) {
    throw new Error(`integration_event ${data.eventId} não encontrado.`);
  }

  await markEventProcessing(db, data.eventId);

  const stored = integrationEvent.normalizedPayload as SpawnAlertEvent | null;
  if (!stored || typeof stored !== "object") {
    await markEventFailed(db, data.eventId, "CSA_NORMALIZED_PAYLOAD_MISSING");
    return { spawnEventId: null, skipped: true };
  }

  const existing = await findSpawnEventByIntegrationEventId(db, data.eventId);
  if (existing) {
    await markEventProcessed(db, data.eventId);
    return { spawnEventId: existing.id, skipped: true };
  }

  const coordinateRegion = buildCoordinateRegion(stored, config);
  const spawnEvent = await createSpawnEvent(db, {
    integrationEventId: data.eventId,
    serverId: stored.serverId ?? data.serverId,
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
    dimension: stored.dimension,
    coordinateRegion,
    occurredAt: stored.receivedAt ? new Date(stored.receivedAt) : undefined,
  });

  await markEventProcessed(db, data.eventId);

  if (!spawnEvent) {
    return { spawnEventId: null, skipped: true };
  }

  const delivery = buildDeliveryPlan(stored, spawnEvent.id, config);
  if (delivery) {
    await enqueueDelivery(delivery);
  }

  return { spawnEventId: spawnEvent.id, skipped: false };
}

/**
 * Passo 2 do worker: entrega no Discord com idempotência efetiva.
 *
 * - reivindicação atômica (delivery_status pending|failed -> delivering);
 * - envio via adaptador;
 * - grava discord_message_id e delivered_at;
 * - falha: registra delivery_status=failed + erro; o BullMQ re-tenta com
 *   backoff exponencial e a reivindicação é liberada novamente.
 *
 * Limitação documentada: se o Discord aceitar a mensagem mas a resposta
 * expirar no cliente, o retry pode duplicar a mensagem. Exatamente-uma-vez
 * não é garantível com REST; efetivamente-uma-vez sob retries normais, sim.
 */
export async function deliverDiscordJob(
  db: DatabaseClient,
  sender: DiscordSender,
  metrics: ProfessorMetrics,
  config: AppConfig,
  data: DeliverJobData,
): Promise<{ delivered: boolean; discordMessageId: string | null }> {
  const claimed = await claimSpawnDelivery(db, data.spawnEventId);
  if (!claimed) {
    return { delivered: false, discordMessageId: null };
  }

  const spawnRow = await findSpawnEventById(db, data.spawnEventId);
  if (!spawnRow) {
    await markSpawnDeliveryFailed(db, data.spawnEventId, "spawn_event não encontrado");
    throw new Error("spawn_event não encontrado na entrega.");
  }

  const event: SpawnAlertEvent = {
    source: "csa",
    sourceVersion: config.CSA_EXPECTED_SOURCE_VERSION ?? "1.13.2",
    serverId: spawnRow.serverId,
    receivedAt: spawnRow.occurredAt?.toISOString() ?? new Date().toISOString(),
    species: spawnRow.species ?? undefined,
    displayName: spawnRow.species ?? undefined,
    dexNumber: spawnRow.dexNumber ?? undefined,
    level: spawnRow.level ?? undefined,
    shiny: spawnRow.shiny ?? false,
    legendary: spawnRow.legendary ?? false,
    mythical: spawnRow.mythical ?? false,
    ultraBeast: spawnRow.ultraBeast ?? false,
    paradox: spawnRow.paradox ?? false,
    bucket: spawnRow.bucket ?? undefined,
    rarity: spawnRow.rarity ?? undefined,
    biome: spawnRow.biome ?? undefined,
    dimension: spawnRow.dimension ?? undefined,
    coordinates: parseRegionCoordinates(spawnRow.coordinateRegion),
  };

  const embed = buildSpawnAlertEmbed(event, {
    coordinatePolicy: data.coordinatePolicy,
    regionGridSize: data.regionGridSize,
    showNearestPlayer: false,
    serverAddress: data.serverAddress,
  });

  if (!embed) {
    await markSpawnDeliveryFailed(db, data.spawnEventId, "embed não gerado");
    return { delivered: false, discordMessageId: null };
  }

  const allowedMentions = buildAllowedMentions(data.roleIds);
  try {
    const response = await sender.send(data.channelId, {
      embeds: [embed],
      allowed_mentions: allowedMentions,
    });
    await markSpawnDelivered(db, data.spawnEventId, response.id);
    metrics.spawnAlertDeliveredTotal
      .labels(classifyTier(event), config.BIGMONCRAFT_SERVER_ID)
      .inc();
    return { delivered: true, discordMessageId: response.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markSpawnDeliveryFailed(db, data.spawnEventId, message);
    metrics.spawnAlertFailedTotal.labels(classifyTier(event), "discord-error").inc();
    throw error;
  }
}

function classifyTier(event: SpawnAlertEvent): string {
  if (event.shiny) return "shiny";
  if (event.legendary || event.mythical || event.ultraBeast) return "legendary";
  if (event.paradox) return "rare";
  return "standard";
}

function buildCoordinateRegion(event: SpawnAlertEvent, config: AppConfig): string | undefined {
  if (config.SPAWN_COORDINATE_POLICY === "hidden") return undefined;
  const x = event.coordinates?.x;
  const z = event.coordinates?.z;
  if (x === undefined || z === undefined) return undefined;
  return `${Math.round(x)},${Math.round(z)}`;
}

function parseRegionCoordinates(region: string | null): SpawnAlertEvent["coordinates"] {
  if (!region) return undefined;
  const [x, z] = region.split(",").map((part) => Number.parseFloat(part));
  if (!Number.isFinite(x) || !Number.isFinite(z)) return undefined;
  return { x, z };
}

/**
 * Define canal e política de coordenadas da entrega:
 * - exact_admin_only: apenas o canal privado configurado recebe coordenadas
 *   exatas; caso contrário, nenhuma entrega é feita (sem coordenadas em canal público).
 * - region: coordenadas arredondadas para a grade.
 * - hidden: sem coordenadas.
 */
export function buildDeliveryPlan(
  event: SpawnAlertEvent,
  spawnEventId: string,
  config: AppConfig,
): DeliverJobData | null {
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
    if (!config.DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID) {
      return null;
    }
    channelId = config.DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID;
  }

  if (!channelId) {
    return null;
  }

  return {
    spawnEventId,
    channelId,
    roleIds,
    coordinatePolicy: policy,
    regionGridSize: config.SPAWN_REGION_GRID_SIZE,
    serverAddress: config.BIGMONCRAFT_SERVER_ADDRESS,
  };
}

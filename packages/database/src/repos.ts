import { eq, sql, and } from "drizzle-orm";
import type { DatabaseClient } from "./client.js";
import { integrationEvents, integrationSources, spawnEvents, spawnLifecycleHistory } from "./schema.js";

export async function findSourceByKey(
  db: DatabaseClient,
  sourceKey: string,
): Promise<typeof integrationSources.$inferSelect | null> {
  const rows = await db
    .select()
    .from(integrationSources)
    .where(eq(integrationSources.sourceKey, sourceKey))
    .limit(1);
  return rows[0] ?? null;
}

export interface EnsureSourceParams {
  sourceKey: string;
  displayName: string;
  serverId: string;
  integrationType: string;
  expectedVersion?: string;
  tokenHash?: string;
}

/**
 * Cria a fonte de integração quando ausente e atualiza metadados quando
 * presente. Idempotente e seguro sob concorrência (INSERT ON CONFLICT DO
 * NOTHING seguido de re-seleção).
 *
 * O hash do token nunca é impresso em logs nem retornado como dado sensível.
 */
export async function ensureIntegrationSource(
  db: DatabaseClient,
  params: EnsureSourceParams,
): Promise<typeof integrationSources.$inferSelect> {
  const existing = await findSourceByKey(db, params.sourceKey);
  if (existing) {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (params.tokenHash && existing.tokenHash !== params.tokenHash) {
      updates.tokenHash = params.tokenHash;
    }
    if (params.serverId && existing.serverId !== params.serverId) {
      updates.serverId = params.serverId;
    }
    if (params.integrationType && existing.integrationType !== params.integrationType) {
      updates.integrationType = params.integrationType;
    }
    if (params.expectedVersion && existing.expectedVersion !== params.expectedVersion) {
      updates.expectedVersion = params.expectedVersion;
    }
    const result = await db
      .update(integrationSources)
      .set(updates)
      .where(eq(integrationSources.id, existing.id))
      .returning();
    return result[0] ?? existing;
  }

  await db
    .insert(integrationSources)
    .values({
      sourceKey: params.sourceKey,
      displayName: params.displayName,
      integrationType: params.integrationType,
      enabled: true,
      tokenHash: params.tokenHash,
      serverId: params.serverId,
      expectedVersion: params.expectedVersion,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeenAt: new Date(),
    })
    .onConflictDoNothing({ target: integrationSources.sourceKey });

  const row = await findSourceByKey(db, params.sourceKey);
  if (!row) throw new Error("Falha ao criar fonte de integração.");
  return row;
}

/** Atualiza `last_seen_at` após requisições válidas. Não revela o token. */
export async function touchSourceLastSeen(db: DatabaseClient, sourceId: string): Promise<void> {
  await db
    .update(integrationSources)
    .set({ lastSeenAt: new Date() })
    .where(eq(integrationSources.id, sourceId));
}

export async function createIntegrationEvent(
  db: DatabaseClient,
  data: {
    sourceId: string;
    requestId?: string;
    fingerprint: string;
    eventType?: string;
    schemaVersion?: string;
    sanitizedPayload?: unknown;
    normalizedPayload?: unknown;
  },
) {
  const result = await db
    .insert(integrationEvents)
    .values({
      sourceId: data.sourceId,
      requestId: data.requestId,
      fingerprint: data.fingerprint,
      eventType: data.eventType ?? "spawn",
      schemaVersion: data.schemaVersion,
      sanitizedPayload: data.sanitizedPayload,
      normalizedPayload: data.normalizedPayload,
      status: "received",
      receivedAt: new Date(),
    })
    .returning();
  return result[0] ?? null;
}

export async function findIntegrationEventById(
  db: DatabaseClient,
  eventId: string,
): Promise<typeof integrationEvents.$inferSelect | null> {
  const rows = await db
    .select()
    .from(integrationEvents)
    .where(eq(integrationEvents.id, eventId))
    .limit(1);
  return rows[0] ?? null;
}

export async function markEventProcessing(db: DatabaseClient, eventId: string) {
  await db
    .update(integrationEvents)
    .set({ status: "processing" })
    .where(eq(integrationEvents.id, eventId));
}

export async function markEventProcessed(db: DatabaseClient, eventId: string) {
  await db
    .update(integrationEvents)
    .set({ status: "processed", processedAt: new Date() })
    .where(eq(integrationEvents.id, eventId));
}

export async function markEventFailed(db: DatabaseClient, eventId: string, errorCode: string) {
  await db
    .update(integrationEvents)
    .set({ status: "failed", errorCode, retryCount: sql`${integrationEvents.retryCount} + 1` })
    .where(eq(integrationEvents.id, eventId));
}

export async function checkFingerprintExists(
  db: DatabaseClient,
  fingerprint: string,
  windowSeconds: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowSeconds * 1000);
  const rows = await db
    .select({ id: integrationEvents.id })
    .from(integrationEvents)
    .where(
      and(
        eq(integrationEvents.fingerprint, fingerprint),
        sql`${integrationEvents.receivedAt} >= ${cutoff}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function findSpawnEventByIntegrationEventId(
  db: DatabaseClient,
  integrationEventId: string,
): Promise<typeof spawnEvents.$inferSelect | null> {
  const rows = await db
    .select()
    .from(spawnEvents)
    .where(eq(spawnEvents.integrationEventId, integrationEventId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findSpawnEventById(
  db: DatabaseClient,
  spawnEventId: string,
): Promise<typeof spawnEvents.$inferSelect | null> {
  const rows = await db.select().from(spawnEvents).where(eq(spawnEvents.id, spawnEventId)).limit(1);
  return rows[0] ?? null;
}

export async function createSpawnEvent(
  db: DatabaseClient,
  data: {
    integrationEventId?: string;
    serverId: string;
    externalSpawnAlertId?: string;
    species?: string;
    form?: string;
    dexNumber?: number;
    level?: number;
    shiny?: boolean;
    legendary?: boolean;
    mythical?: boolean;
    ultraBeast?: boolean;
    paradox?: boolean;
    rarity?: string;
    bucket?: string;
    biome?: string;
    dimension?: string;
    coordinateRegion?: string;
    occurredAt?: Date;
    lifecycleStatus?: string;
    spawnOrigin?: string;
    worldKey?: string;
    worldDisplayName?: string;
    dimensionKey?: string;
    locationVisibility?: string;
    alertReasons?: unknown;
    matchedRuleIds?: unknown;
    involvedPlayerName?: string;
    spawnedAt?: Date;
  },
) {
  const result = await db
    .insert(spawnEvents)
    .values({
      integrationEventId: data.integrationEventId,
      serverId: data.serverId,
      externalSpawnAlertId: data.externalSpawnAlertId,
      species: data.species,
      form: data.form,
      dexNumber: data.dexNumber,
      level: data.level,
      shiny: data.shiny ?? false,
      legendary: data.legendary ?? false,
      mythical: data.mythical ?? false,
      ultraBeast: data.ultraBeast ?? false,
      paradox: data.paradox ?? false,
      rarity: data.rarity,
      bucket: data.bucket,
      biome: data.biome,
      dimension: data.dimension,
      coordinateRegion: data.coordinateRegion,
      occurredAt: data.occurredAt ?? new Date(),
      lifecycleStatus: data.lifecycleStatus ?? "SPAWNED",
      lifecycleRevision: 1,
      spawnOrigin: data.spawnOrigin,
      worldKey: data.worldKey,
      worldDisplayName: data.worldDisplayName,
      dimensionKey: data.dimensionKey,
      locationVisibility: data.locationVisibility,
      alertReasons: data.alertReasons,
      matchedRuleIds: data.matchedRuleIds,
      involvedPlayerName: data.involvedPlayerName,
      spawnedAt: data.spawnedAt,
      lastLifecycleAt: new Date(),
    })
    .onConflictDoNothing({ target: spawnEvents.integrationEventId })
    .returning();
  return result[0] ?? null;
}

/**
 * Reivindicação atômica da entrega Discord.
 * Retorna a linha apenas se a entrega ainda não foi concluída nem está em
 * andamento; uma retry do BullMQ só re-envia quando o estado anterior era
 * `pending` ou `failed`.
 */
export async function claimSpawnDelivery(
  db: DatabaseClient,
  spawnEventId: string,
): Promise<typeof spawnEvents.$inferSelect | null> {
  const rows = await db
    .update(spawnEvents)
    .set({
      deliveryStatus: "delivering",
      deliveryAttempts: sql`${spawnEvents.deliveryAttempts} + 1`,
    })
    .where(
      and(
        eq(spawnEvents.id, spawnEventId),
        sql`${spawnEvents.deliveryStatus} NOT IN ('delivered', 'delivering')`,
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function markSpawnDelivered(
  db: DatabaseClient,
  spawnEventId: string,
  discordMessageId: string,
): Promise<void> {
  await db
    .update(spawnEvents)
    .set({
      deliveryStatus: "delivered",
      discordMessageId,
      deliveredAt: new Date(),
      lastDeliveryError: null,
    })
    .where(eq(spawnEvents.id, spawnEventId));
}

export async function markSpawnDeliveryFailed(
  db: DatabaseClient,
  spawnEventId: string,
  errorMessage: string,
): Promise<void> {
  await db
    .update(spawnEvents)
    .set({
      deliveryStatus: "failed",
      lastDeliveryError: errorMessage.slice(0, 1000),
    })
    .where(eq(spawnEvents.id, spawnEventId));
}

export async function cleanupExpiredEvents(
  db: DatabaseClient,
  retainDays: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - retainDays * 24 * 3600 * 1000);
  const result = await db
    .delete(integrationEvents)
    .where(sql`${integrationEvents.receivedAt} < ${cutoff}`)
    .returning({ id: integrationEvents.id });
  return result.length;
}

export async function findSpawnByExternalId(
  db: DatabaseClient,
  serverId: string,
  externalSpawnAlertId: string,
): Promise<typeof spawnEvents.$inferSelect | null> {
  const rows = await db
    .select()
    .from(spawnEvents)
    .where(
      and(
        eq(spawnEvents.serverId, serverId),
        eq(spawnEvents.externalSpawnAlertId, externalSpawnAlertId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function applyLifecycleTransition(
  db: DatabaseClient,
  spawnEventId: string,
  newStatus: string,
  newRevision: number,
  data: {
    involvedPlayerName?: string;
    resolvedAt?: Date;
  },
): Promise<typeof spawnEvents.$inferSelect | null> {
  const updates: Record<string, unknown> = {
    lifecycleStatus: newStatus,
    lifecycleRevision: newRevision,
    lastLifecycleAt: new Date(),
  };
  if (data.involvedPlayerName) {
    updates.involvedPlayerName = data.involvedPlayerName;
  }
  if (data.resolvedAt) {
    updates.resolvedAt = data.resolvedAt;
  }
  const rows = await db
    .update(spawnEvents)
    .set(updates)
    .where(
      and(
        eq(spawnEvents.id, spawnEventId),
        sql`${spawnEvents.lifecycleRevision} = ${newRevision - 1}`,
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function insertLifecycleHistory(
  db: DatabaseClient,
  data: {
    spawnEventId: string;
    externalSpawnAlertId: string;
    status: string;
    revision: number;
    occurredAt?: Date;
    playerName?: string;
    payloadHash?: string;
    normalizedPayload?: unknown;
    applied: boolean;
    rejectionReason?: string;
  },
): Promise<typeof spawnLifecycleHistory.$inferSelect | null> {
  const rows = await db
    .insert(spawnLifecycleHistory)
    .values({
      spawnEventId: data.spawnEventId,
      externalSpawnAlertId: data.externalSpawnAlertId,
      status: data.status,
      revision: data.revision,
      occurredAt: data.occurredAt,
      playerName: data.playerName,
      payloadHash: data.payloadHash,
      normalizedPayload: data.normalizedPayload,
      applied: data.applied,
      rejectionReason: data.rejectionReason,
      receivedAt: new Date(),
    })
    .returning();
  return rows[0] ?? null;
}

export async function updateSpawnDiscordIds(
  db: DatabaseClient,
  spawnEventId: string,
  data: {
    discordChannelId: string;
    discordMessageId: string;
  },
): Promise<void> {
  await db
    .update(spawnEvents)
    .set({
      discordChannelId: data.discordChannelId,
      discordMessageId: data.discordMessageId,
      deliveredAt: new Date(),
      deliveryStatus: "delivered",
      lastDeliveryError: null,
    })
    .where(eq(spawnEvents.id, spawnEventId));
}

export async function claimSpawnEdit(
  db: DatabaseClient,
  spawnEventId: string,
  expectedRevision: number,
): Promise<typeof spawnEvents.$inferSelect | null> {
  const rows = await db
    .update(spawnEvents)
    .set({ deliveryAttempts: sql`${spawnEvents.deliveryAttempts} + 1` })
    .where(
      and(
        eq(spawnEvents.id, spawnEventId),
        sql`${spawnEvents.lifecycleRevision} = ${expectedRevision}`,
        sql`${spawnEvents.deliveryStatus} = 'delivered'`,
      ),
    )
    .returning();
  return rows[0] ?? null;
}

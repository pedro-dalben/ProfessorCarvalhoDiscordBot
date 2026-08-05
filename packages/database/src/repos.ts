import { eq, sql, and } from "drizzle-orm";
import type { DatabaseClient } from "./client.js";
import { integrationEvents, integrationSources, spawnEvents } from "./schema.js";

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

export async function createIntegrationEvent(
  db: DatabaseClient,
  data: {
    sourceId: string;
    requestId?: string;
    fingerprint: string;
    eventType?: string;
    schemaVersion?: string;
    sanitizedPayload?: unknown;
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
      status: "received",
      receivedAt: new Date(),
    })
    .returning();
  return result[0] ?? null;
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

export async function createSpawnEvent(
  db: DatabaseClient,
  data: {
    integrationEventId?: string;
    serverId: string;
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
  },
) {
  const result = await db
    .insert(spawnEvents)
    .values({
      integrationEventId: data.integrationEventId,
      serverId: data.serverId,
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
    })
    .returning();
  return result[0] ?? null;
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

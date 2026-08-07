import { eq, and, desc, sql, inArray, asc, count, isNull } from "drizzle-orm";
import type { DatabaseClient } from "./client.js";
import {
  gameEvents,
  playerJourneyEntries,
  playerJourneyStats,
  playerCapturedSpecies,
} from "./schema.js";
import type { GameEventRow } from "@bigbangcraft/domain";

export async function insertGameEvent(
  db: DatabaseClient,
  data: {
    eventId: string;
    eventType: string;
    schemaVersion?: string;
    serverId: string;
    source: string;
    sourceEventId?: string;
    minecraftUuid?: string;
    identityLinkId?: string;
    occurredAt: Date;
    payload: unknown;
    backfilled?: boolean;
  },
): Promise<GameEventRow | null> {
  const rows = await db
    .insert(gameEvents)
    .values({
      eventId: data.eventId,
      eventType: data.eventType,
      schemaVersion: data.schemaVersion ?? "1.0",
      serverId: data.serverId,
      source: data.source,
      sourceEventId: data.sourceEventId,
      minecraftUuid: data.minecraftUuid,
      identityLinkId: data.identityLinkId,
      occurredAt: data.occurredAt,
      receivedAt: new Date(),
      payload: data.payload as Record<string, unknown>,
      backfilled: data.backfilled ?? false,
    })
    .onConflictDoNothing({ target: gameEvents.eventId })
    .returning();
  return rows[0] ?? null;
}

export async function findGameEventById(
  db: DatabaseClient,
  eventId: string,
): Promise<GameEventRow | null> {
  const rows = await db
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.eventId, eventId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findGameEventBySource(
  db: DatabaseClient,
  source: string,
  sourceEventId: string,
): Promise<GameEventRow | null> {
  const rows = await db
    .select()
    .from(gameEvents)
    .where(and(eq(gameEvents.source, source), eq(gameEvents.sourceEventId, sourceEventId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findRecentGameEventsByMinecraftUuid(
  db: DatabaseClient,
  minecraftUuid: string,
  limit: number = 50,
): Promise<GameEventRow[]> {
  return db
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.minecraftUuid, minecraftUuid))
    .orderBy(desc(gameEvents.occurredAt))
    .limit(limit);
}

export async function countGameEventsByType(
  db: DatabaseClient,
  eventType: string,
  serverId: string,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(gameEvents)
    .where(
      and(
        eq(gameEvents.eventType, eventType),
        eq(gameEvents.serverId, serverId),
        sql`${gameEvents.occurredAt} >= ${since}`,
      ),
    );
  return rows[0]?.count ?? 0;
}

export interface GameEventSummary {
  eventType: string;
  count: number;
}

export async function globalGameEventCounts(
  db: DatabaseClient,
  serverId: string,
  since: Date,
): Promise<GameEventSummary[]> {
  const rows = await db
    .select({ eventType: gameEvents.eventType, count: count() })
    .from(gameEvents)
    .where(
      and(
        eq(gameEvents.serverId, serverId),
        sql`${gameEvents.occurredAt} >= ${since}`,
      ),
    )
    .groupBy(gameEvents.eventType);
  return rows;
}

export async function insertJourneyEntry(
  db: DatabaseClient,
  data: {
    identityLinkId?: string;
    minecraftUuid: string;
    gameEventId?: string;
    entryType: string;
    title?: string;
    descriptionKey?: string;
    metadata?: Record<string, unknown>;
    occurredAt: Date;
  },
): Promise<typeof playerJourneyEntries.$inferSelect | null> {
  const rows = await db
    .insert(playerJourneyEntries)
    .values({
      identityLinkId: data.identityLinkId,
      minecraftUuid: data.minecraftUuid,
      gameEventId: data.gameEventId,
      entryType: data.entryType,
      title: data.title,
      descriptionKey: data.descriptionKey,
      metadata: data.metadata ?? {},
      occurredAt: data.occurredAt,
    })
    .returning();
  return rows[0] ?? null;
}

export async function findJourneyEntriesByMinecraftUuid(
  db: DatabaseClient,
  minecraftUuid: string,
  options: {
    limit?: number;
    offset?: number;
    entryTypes?: string[];
  } = {},
): Promise<(typeof playerJourneyEntries.$inferSelect)[]> {
  const filters = [eq(playerJourneyEntries.minecraftUuid, minecraftUuid)];
  if (options.entryTypes?.length) {
    filters.push(inArray(playerJourneyEntries.entryType, options.entryTypes));
  }
  return db
    .select()
    .from(playerJourneyEntries)
    .where(and(...filters))
    .orderBy(desc(playerJourneyEntries.occurredAt))
    .limit(options.limit ?? 10)
    .offset(options.offset ?? 0);
}

export async function findJourneyEntriesByLinkId(
  db: DatabaseClient,
  linkId: string,
  options: {
    limit?: number;
    offset?: number;
    entryTypes?: string[];
  } = {},
): Promise<(typeof playerJourneyEntries.$inferSelect)[]> {
  const filters = [eq(playerJourneyEntries.identityLinkId, linkId)];
  if (options.entryTypes?.length) {
    filters.push(inArray(playerJourneyEntries.entryType, options.entryTypes));
  }
  return db
    .select()
    .from(playerJourneyEntries)
    .where(and(...filters))
    .orderBy(desc(playerJourneyEntries.occurredAt))
    .limit(options.limit ?? 10)
    .offset(options.offset ?? 0);
}

export async function countJourneyEntries(
  db: DatabaseClient,
  minecraftUuid: string,
  entryTypes?: string[],
): Promise<number> {
  const filters = [eq(playerJourneyEntries.minecraftUuid, minecraftUuid)];
  if (entryTypes?.length) {
    filters.push(inArray(playerJourneyEntries.entryType, entryTypes));
  }
  const rows = await db
    .select({ count: count() })
    .from(playerJourneyEntries)
    .where(and(...filters));
  return rows[0]?.count ?? 0;
}

export async function getOrCreateJourneyStats(
  db: DatabaseClient,
  data: {
    minecraftUuid: string;
    minecraftName: string;
    linkId?: string;
  },
): Promise<typeof playerJourneyStats.$inferSelect> {
  const existing = await db
    .select()
    .from(playerJourneyStats)
    .where(eq(playerJourneyStats.minecraftUuid, data.minecraftUuid))
    .limit(1);

  if (existing[0]) return existing[0];

  const rows = await db
    .insert(playerJourneyStats)
    .values({
      minecraftUuid: data.minecraftUuid,
      minecraftName: data.minecraftName,
      linkId: data.linkId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: playerJourneyStats.minecraftUuid })
    .returning();
  if (rows[0]) return rows[0];

  const retry = await db
    .select()
    .from(playerJourneyStats)
    .where(eq(playerJourneyStats.minecraftUuid, data.minecraftUuid))
    .limit(1);
  if (!retry[0]) throw new Error("Failed to create journey stats");
  return retry[0];
}

export async function findJourneyStatsByUuid(
  db: DatabaseClient,
  minecraftUuid: string,
): Promise<typeof playerJourneyStats.$inferSelect | null> {
  const rows = await db
    .select()
    .from(playerJourneyStats)
    .where(eq(playerJourneyStats.minecraftUuid, minecraftUuid))
    .limit(1);
  return rows[0] ?? null;
}

export async function findJourneyStatsByLinkId(
  db: DatabaseClient,
  linkId: string,
): Promise<typeof playerJourneyStats.$inferSelect | null> {
  const rows = await db
    .select()
    .from(playerJourneyStats)
    .where(eq(playerJourneyStats.linkId, linkId))
    .limit(1);
  return rows[0] ?? null;
}

export async function incrementStats(
  db: DatabaseClient,
  minecraftUuid: string,
  updates: Partial<{
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
    mostCapturedSpecies: string;
    rarestCapturedSpecies: string;
    lastCapturedSpecies: string;
    lastShinySpecies: string;
    lastLegendarySpecies: string;
    fastestRareCaptureSeconds: number;
    totalRareCaptureTimeSeconds: number;
    rareCaptureCount: number;
    lastPokedexCount: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
  }>,
): Promise<void> {
  const increments: string[] = [];
  const set: Record<string, unknown> = { updatedAt: new Date() };

  const numericFields: Array<
    keyof typeof updates & string
  > = [
    "totalCaptures", "uniqueSpeciesCaptured", "shinyCaptures",
    "legendaryCaptures", "mythicalCaptures", "rareCaptures",
    "rareEncounters", "rareDefeated", "rareDespawned",
    "totalPlaytime", "sessions", "evolutions", "trades",
    "totalRareCaptureTimeSeconds", "rareCaptureCount",
  ];

  for (const field of numericFields) {
    const value = updates[field];
    if (typeof value === "number" && value !== 0) {
      increments.push(`${field} + ${value}`);
    }
  }

  const stringFields: Array<keyof typeof updates & string> = [
    "mostCapturedSpecies", "rarestCapturedSpecies", "lastCapturedSpecies",
    "lastShinySpecies", "lastLegendarySpecies",
  ];
  for (const field of stringFields) {
    const value = updates[field];
    if (typeof value === "string") {
      set[field] = value;
    }
  }

  if (updates.fastestRareCaptureSeconds !== undefined) {
    set.fastestRareCaptureSeconds = updates.fastestRareCaptureSeconds;
  }
  if (updates.lastPokedexCount !== undefined) {
    set.lastPokedexCount = updates.lastPokedexCount;
  }
  if (updates.firstSeenAt !== undefined) {
    set.firstSeenAt = updates.firstSeenAt;
  }
  if (updates.lastSeenAt !== undefined) {
    set.lastSeenAt = updates.lastSeenAt;
  }

  if (increments.length > 0) {
    set.rawIncrements = increments;
  }

  if (increments.length === 0 && Object.keys(set).length <= 1) return;

  if (increments.length > 0) {
    const sqlParts = increments.map((inc) => sql.raw(inc));
    setSqlFromIncrements(db, minecraftUuid, increments, set);
  } else {
    await db
      .update(playerJourneyStats)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(playerJourneyStats.minecraftUuid, minecraftUuid));
  }
}

async function setSqlFromIncrements(
  db: DatabaseClient,
  minecraftUuid: string,
  increments: string[],
  set: Record<string, unknown>,
): Promise<void> {
  const setClauses = increments.map((inc) => sql.raw(inc)).join(", ");
  const setObj: Record<string, unknown> = { updatedAt: new Date(), ...set };

  if (increments.length > 0) {
    await db.execute(
      sql`
        UPDATE player_journey_stats
        SET
          ${sql.raw(increments.join(",\n          "))},
          updated_at = NOW()
        WHERE minecraft_uuid = ${minecraftUuid}
      `,
    );
  } else {
    await db
      .update(playerJourneyStats)
      .set({ ...setObj, updatedAt: new Date() })
      .where(eq(playerJourneyStats.minecraftUuid, minecraftUuid));
  }
}

export async function upsertCapturedSpecies(
  db: DatabaseClient,
  data: {
    minecraftUuid: string;
    species: string;
    occurredAt: Date;
  },
): Promise<boolean> {
  const existing = await db
    .select()
    .from(playerCapturedSpecies)
    .where(
      and(
        eq(playerCapturedSpecies.minecraftUuid, data.minecraftUuid),
        eq(playerCapturedSpecies.species, data.species),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(playerCapturedSpecies)
      .set({
        captureCount: sql`${playerCapturedSpecies.captureCount} + 1`,
      })
      .where(eq(playerCapturedSpecies.id, existing[0].id));
    return false;
  }

  await db
    .insert(playerCapturedSpecies)
    .values({
      minecraftUuid: data.minecraftUuid,
      species: data.species,
      firstCapturedAt: data.occurredAt,
      captureCount: 1,
    })
    .onConflictDoNothing({
      target: [playerCapturedSpecies.minecraftUuid, playerCapturedSpecies.species],
    });
  return true;
}

export async function countUniqueSpecies(
  db: DatabaseClient,
  minecraftUuid: string,
): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(playerCapturedSpecies)
    .where(eq(playerCapturedSpecies.minecraftUuid, minecraftUuid));
  return rows[0]?.count ?? 0;
}

export async function findRecentCapturesBySpecies(
  db: DatabaseClient,
  species: string,
  serverId: string,
  since: Date,
): Promise<GameEventRow[]> {
  return db
    .select()
    .from(gameEvents)
    .where(
      and(
        eq(gameEvents.eventType, "pokemon.capture.completed"),
        eq(gameEvents.serverId, serverId),
        sql`${gameEvents.occurredAt} >= ${since}`,
        sql`${gameEvents.payload}->>'species' = ${species}`,
      ),
    )
    .orderBy(desc(gameEvents.occurredAt))
    .limit(20);
}

export async function globalStatsSummary(
  db: DatabaseClient,
  serverId: string,
  since: Date,
): Promise<{
  rareSpawns: number;
  rareCaptures: number;
  rareDespawns: number;
  shinyCaptures: number;
  legendaryCaptures: number;
  mostSpawnedSpecies: string | null;
  mostEscapedSpecies: string | null;
}> {
  const rareSpawns = await countGameEventsByType(
    db, "pokemon.rare.spawned", serverId, since,
  );
  const rareCaptures = await countGameEventsByType(
    db, "pokemon.rare.captured", serverId, since,
  );
  const rareDespawns = await countGameEventsByType(
    db, "pokemon.rare.despawned", serverId, since,
  );

  const shinyRows = await db
    .select({ count: count() })
    .from(gameEvents)
    .where(
      and(
        eq(gameEvents.serverId, serverId),
        sql`${gameEvents.occurredAt} >= ${since}`,
        sql`${gameEvents.payload}->>'shiny' = 'true'`,
        sql`${gameEvents.eventType} IN ('pokemon.capture.completed', 'pokemon.rare.captured')`,
      ),
    );
  const shinyCaptures = shinyRows[0]?.count ?? 0;

  const legendaryRows = await db
    .select({ count: count() })
    .from(gameEvents)
    .where(
      and(
        eq(gameEvents.serverId, serverId),
        sql`${gameEvents.occurredAt} >= ${since}`,
        sql`${gameEvents.payload}->>'legendary' = 'true'`,
        sql`${gameEvents.eventType} IN ('pokemon.capture.completed', 'pokemon.rare.captured')`,
      ),
    );
  const legendaryCaptures = legendaryRows[0]?.count ?? 0;

  return {
    rareSpawns,
    rareCaptures,
    rareDespawns,
    shinyCaptures,
    legendaryCaptures,
    mostSpawnedSpecies: null,
    mostEscapedSpecies: null,
  };
}

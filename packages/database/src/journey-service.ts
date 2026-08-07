import type { DatabaseClient } from "./client.js";
import {
  insertGameEvent,
  findGameEventById,
  findGameEventBySource,
  insertJourneyEntry,
  getOrCreateJourneyStats,
  upsertCapturedSpecies,
  countUniqueSpecies,
  findJourneyStatsByUuid,
} from "./journey.js";
import { findActiveIdentity } from "./identity.js";
import { playerJourneyStats } from "./schema.js";
import { eq, sql } from "drizzle-orm";
import { pokedexMilestoneForCount } from "@bigbangcraft/domain";

export interface JourneyServiceDeps {
  db: DatabaseClient;
}

export interface GameEventInput {
  eventId: string;
  eventType: string;
  schemaVersion: string;
  serverId: string;
  source: string;
  sourceEventId?: string;
  minecraftUuid?: string;
  identityLinkId?: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export async function storeGameEvent(
  deps: JourneyServiceDeps,
  input: GameEventInput,
): Promise<{ eventId: string; duplicate: boolean; dbId: string | null }> {
  const existing = await findGameEventById(deps.db, input.eventId);
  if (existing) {
    return { eventId: input.eventId, duplicate: true, dbId: existing.id };
  }
  if (input.sourceEventId) {
    const bySource = await findGameEventBySource(deps.db, input.source, input.sourceEventId);
    if (bySource) {
      return { eventId: input.eventId, duplicate: true, dbId: bySource.id };
    }
  }

  let linkId = input.identityLinkId;
  if (input.minecraftUuid && !linkId) {
    const link = await findActiveIdentity(deps.db, {
      minecraftUuid: input.minecraftUuid,
      serverId: input.serverId,
    });
    if (link) linkId = link.id;
  }

  const row = await insertGameEvent(deps.db, {
    eventId: input.eventId,
    eventType: input.eventType,
    schemaVersion: input.schemaVersion,
    serverId: input.serverId,
    source: input.source,
    sourceEventId: input.sourceEventId,
    minecraftUuid: input.minecraftUuid,
    identityLinkId: linkId ?? undefined,
    occurredAt: input.occurredAt,
    payload: input.payload,
  });

  return { eventId: input.eventId, duplicate: row === null, dbId: row?.id ?? null };
}

export async function processCaptureEvent(
  deps: JourneyServiceDeps,
  gameEventDbId: string,
  minecraftUuid: string,
  linkId: string | undefined,
  serverId: string,
  payload: Record<string, unknown>,
): Promise<number> {
  let count = 0;
  const species = stringField(payload, "species");
  const shiny = payload.shiny === true;
  const legendary = payload.legendary === true;
  const mythical = payload.mythical === true;
  const occurredAt = new Date(stringField(payload, "occurredAt") ?? Date.now());

  const stats = await getOrCreateJourneyStats(deps.db, {
    minecraftUuid,
    minecraftName: stringField(payload, "minecraftName") ?? "",
    linkId,
  });

  let entryType = "capture";
  let title: string | undefined;

  if (shiny && legendary) {
    entryType = "legendary_capture";
    title = `✨ Capturou ${species ?? "shiny lendário"}!`;
  } else if (shiny) {
    entryType = "shiny_capture";
    title = `✨ Capturou ${species ?? "shiny"}!`;
  } else if (legendary) {
    entryType = "legendary_capture";
    title = `👑 Capturou ${species ?? "lendário"}!`;
  } else if (mythical) {
    entryType = "mythical_capture";
    title = `🌟 Capturou ${species ?? "mítico"}!`;
  } else {
    title = `🔴 Capturou ${species ?? "Pokémon"}`;
  }

  const isNewSpecies = species
    ? await upsertCapturedSpecies(deps.db, { minecraftUuid, species, occurredAt })
    : false;

  const uniqueCount = species
    ? await countUniqueSpecies(deps.db, minecraftUuid)
    : stats.uniqueSpeciesCaptured;

  const isFirstCapture = stats.totalCaptures === 0;
  const isFirstShiny = shiny && stats.shinyCaptures === 0;
  const isFirstLegendary = legendary && stats.legendaryCaptures === 0;

  await insertJourneyEntry(deps.db, {
    minecraftUuid,
    identityLinkId: linkId,
    gameEventId: gameEventDbId,
    entryType,
    title,
    metadata: {
      species: species ?? null,
      form: stringField(payload, "form") ?? null,
      dexNumber: numberField(payload, "dexNumber"),
      level: numberField(payload, "level"),
      shiny,
      legendary,
      mythical,
    },
    occurredAt,
  });
  count++;

  if (isFirstCapture) {
    await insertJourneyEntry(deps.db, {
      minecraftUuid,
      identityLinkId: linkId,
      gameEventId: gameEventDbId,
      entryType: "first_capture",
      title: "🔴 Primeiro Pokémon capturado!",
      metadata: { species: species ?? null },
      occurredAt,
    });
    count++;
  }
  if (isFirstShiny) {
    await insertJourneyEntry(deps.db, {
      minecraftUuid,
      identityLinkId: linkId,
      gameEventId: gameEventDbId,
      entryType: "first_shiny",
      title: "✨ Primeiro shiny capturado!",
      metadata: { species: species ?? null },
      occurredAt,
    });
    count++;
  }
  if (isFirstLegendary) {
    await insertJourneyEntry(deps.db, {
      minecraftUuid,
      identityLinkId: linkId,
      gameEventId: gameEventDbId,
      entryType: "first_legendary",
      title: "👑 Primeiro lendário capturado!",
      metadata: { species: species ?? null },
      occurredAt,
    });
    count++;
  }

  await deps.db
    .update(playerJourneyStats)
    .set({
      totalCaptures: sql`${playerJourneyStats.totalCaptures} + 1`,
      uniqueSpeciesCaptured: uniqueCount,
      shinyCaptures: shiny
        ? sql`${playerJourneyStats.shinyCaptures} + 1`
        : playerJourneyStats.shinyCaptures,
      legendaryCaptures: legendary
        ? sql`${playerJourneyStats.legendaryCaptures} + 1`
        : playerJourneyStats.legendaryCaptures,
      mythicalCaptures: mythical
        ? sql`${playerJourneyStats.mythicalCaptures} + 1`
        : playerJourneyStats.mythicalCaptures,
      lastCapturedSpecies: species ?? playerJourneyStats.lastCapturedSpecies,
      lastShinySpecies: shiny ? species ?? playerJourneyStats.lastShinySpecies : playerJourneyStats.lastShinySpecies,
      lastLegendarySpecies: legendary ? species ?? playerJourneyStats.lastLegendarySpecies : playerJourneyStats.lastLegendarySpecies,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(playerJourneyStats.minecraftUuid, minecraftUuid));

  return count;
}

export async function processRareCapturedEvent(
  deps: JourneyServiceDeps,
  gameEventDbId: string,
  minecraftUuid: string,
  linkId: string | undefined,
  payload: Record<string, unknown>,
): Promise<number> {
  const species = stringField(payload, "species");
  const shiny = payload.shiny === true;
  const legendary = payload.legendary === true;
  const occurredAt = new Date(stringField(payload, "occurredAt") ?? Date.now());

  await getOrCreateJourneyStats(deps.db, {
    minecraftUuid,
    minecraftName: "",
    linkId,
  });

  let title: string;
  if (shiny && legendary) title = `✨ Capturou ${species ?? "shiny lendário raro"}!`;
  else if (shiny) title = `✨ Capturou ${species ?? "shiny raro"}!`;
  else if (legendary) title = `👑 Capturou ${species ?? "lendário raro"}!`;
  else title = `✅ Capturou ${species ?? "raro"}!`;

  await insertJourneyEntry(deps.db, {
    minecraftUuid,
    identityLinkId: linkId,
    gameEventId: gameEventDbId,
    entryType: "rare_captured",
    title,
    metadata: {
      species: species ?? null,
      shiny,
      legendary,
      mythical: payload.mythical === true,
      spawnAlertId: stringField(payload, "spawnAlertId") ?? null,
    },
    occurredAt,
  });

  await deps.db
    .update(playerJourneyStats)
    .set({
      rareCaptures: sql`${playerJourneyStats.rareCaptures} + 1`,
      rareCaptureCount: sql`${playerJourneyStats.rareCaptureCount} + 1`,
      shinyCaptures: shiny
        ? sql`${playerJourneyStats.shinyCaptures} + 1`
        : playerJourneyStats.shinyCaptures,
      legendaryCaptures: legendary
        ? sql`${playerJourneyStats.legendaryCaptures} + 1`
        : playerJourneyStats.legendaryCaptures,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(playerJourneyStats.minecraftUuid, minecraftUuid));

  return 1;
}

export async function processEvolutionEvent(
  deps: JourneyServiceDeps,
  gameEventDbId: string,
  minecraftUuid: string,
  linkId: string | undefined,
  payload: Record<string, unknown>,
): Promise<number> {
  const fromSpecies = stringField(payload, "fromSpecies");
  const toSpecies = stringField(payload, "toSpecies");
  const occurredAt = new Date(stringField(payload, "occurredAt") ?? Date.now());

  await getOrCreateJourneyStats(deps.db, {
    minecraftUuid,
    minecraftName: "",
    linkId,
  });

  await insertJourneyEntry(deps.db, {
    minecraftUuid,
    identityLinkId: linkId,
    gameEventId: gameEventDbId,
    entryType: "evolution",
    title: `🧬 ${fromSpecies ?? "?"} evoluiu para ${toSpecies ?? "?"}`,
    metadata: {
      fromSpecies: fromSpecies ?? null,
      toSpecies: toSpecies ?? null,
    },
    occurredAt,
  });

  await deps.db
    .update(playerJourneyStats)
    .set({
      evolutions: sql`${playerJourneyStats.evolutions} + 1`,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(playerJourneyStats.minecraftUuid, minecraftUuid));

  return 1;
}

export async function processSessionStarted(
  deps: JourneyServiceDeps,
  minecraftUuid: string,
  linkId: string | undefined,
): Promise<void> {
  const stats = await getOrCreateJourneyStats(deps.db, {
    minecraftUuid,
    minecraftName: "",
    linkId,
  });

  await deps.db
    .update(playerJourneyStats)
    .set({
      sessions: sql`${playerJourneyStats.sessions} + 1`,
      lastSeenAt: new Date(),
      firstSeenAt: stats.firstSeenAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(playerJourneyStats.minecraftUuid, minecraftUuid));
}

export async function processProfileSnapshot(
  deps: JourneyServiceDeps,
  gameEventDbId: string,
  minecraftUuid: string,
  linkId: string | undefined,
  payload: Record<string, unknown>,
): Promise<number> {
  let count = 0;

  const progression = isRecord(payload.progression) ? payload.progression : {};
  const cobblemon = isRecord(payload.cobblemon) ? payload.cobblemon : {};
  const pokedex = isRecord(cobblemon.pokedex) ? cobblemon.pokedex : {};
  const caught = numberField(pokedex, "caught");
  const total = numberField(pokedex, "total");
  const playtimeSeconds = numberField(progression, "playtimeSeconds");
  const minecraftName = stringField(
    isRecord(payload.player) ? payload.player : {},
    "minecraftName",
  );

  const stats = await getOrCreateJourneyStats(deps.db, {
    minecraftUuid,
    minecraftName: minecraftName ?? "",
    linkId,
  });

  if (caught !== undefined) {
    const milestone = pokedexMilestoneForCount(caught, stats.lastPokedexCount);
    if (milestone) {
      const occurredAt = new Date();
      await insertJourneyEntry(deps.db, {
        minecraftUuid,
        identityLinkId: linkId,
        gameEventId: gameEventDbId,
        entryType: "pokedex_milestone",
        title: `📖 Pokédex chegou a ${milestone} espécies!`,
        metadata: { caught, total: total ?? null, milestone },
        occurredAt,
      });
      count++;
    }
  }

  await deps.db
    .update(playerJourneyStats)
    .set({
      totalPlaytime: playtimeSeconds ?? stats.totalPlaytime,
      lastPokedexCount: caught ?? stats.lastPokedexCount,
      minecraftName: minecraftName ?? stats.minecraftName,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(playerJourneyStats.minecraftUuid, minecraftUuid));

  return count;
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function numberField(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

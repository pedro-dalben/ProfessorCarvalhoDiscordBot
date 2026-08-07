import "dotenv/config";
import { createDatabaseClient } from "../packages/database/src/client.js";
import {
  storeGameEvent,
  processSessionStarted,
  processCaptureEvent,
  processEvolutionEvent,
} from "../packages/database/src/journey-service.js";

const JOURNEY_TYPES = [
  "player.session.started",
  "player.session.ended",
  "pokemon.capture.completed",
  "pokemon.evolution.completed",
];

/* eslint-disable no-console */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }
  const serverId = process.env.BIGMONCRAFT_SERVER_ID ?? "bigmoncraft";
  const dryRun = process.argv.includes("--dry-run");

  const { db, pool } = createDatabaseClient({
    connectionString,
    poolMax: 1,
    connectionTimeoutMs: 5000,
    statementTimeoutMs: 30000,
  });

  try {
    const { rows } = await pool.query(
      `SELECT id, event_id, event_type, schema_version, server_id, payload, occurred_at
       FROM gateway_events
       WHERE server_id = $1 AND event_type = ANY($2)
       ORDER BY occurred_at ASC`,
      [serverId, JOURNEY_TYPES],
    );

    console.log(`Candidatos (gateway_events ${serverId}): ${rows.length}`);

    let stored = 0;
    let duplicates = 0;
    let noUuid = 0;

    for (const row of rows) {
      const p = (row.payload ?? {}) as Record<string, unknown>;
      const player = isRecord(p.player) ? p.player : {};
      const mcUuid =
        (typeof p.minecraftUuid === "string" ? p.minecraftUuid : undefined) ??
        (typeof player.minecraftUuid === "string" ? player.minecraftUuid : undefined);

      if (!mcUuid) {
        noUuid++;
        continue;
      }

      const occurredAt = row.occurred_at ? new Date(row.occurred_at) : new Date();
      if (dryRun) {
        stored++;
        continue;
      }

      const result = await storeGameEvent({ db }, {
        eventId: row.event_id,
        eventType: row.event_type,
        schemaVersion: row.schema_version ?? "1.0",
        serverId: row.server_id,
        source: "gateway",
        sourceEventId: row.event_id,
        minecraftUuid: mcUuid,
        occurredAt,
        payload: p,
      });

      if (result.duplicate || !result.dbId) {
        duplicates++;
        continue;
      }
      stored++;

      const linkId = result.identityLinkId ?? undefined;
      if (row.event_type === "player.session.started") {
        await processSessionStarted({ db }, mcUuid, linkId);
      } else if (row.event_type === "pokemon.capture.completed") {
        await processCaptureEvent({ db }, result.dbId, mcUuid, linkId, serverId, p);
      } else if (row.event_type === "pokemon.evolution.completed") {
        await processEvolutionEvent({ db }, result.dbId, mcUuid, linkId, p);
      }
    }

    console.log(`Resumo (${dryRun ? "dry-run" : "real"}):`);
    console.log(`  Processados: ${stored}`);
    console.log(`  Duplicados/skip: ${duplicates}`);
    console.log(`  Sem minecraftUuid: ${noUuid}`);
  } finally {
    await pool.end();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main().catch((error) => {
  console.error("Backfill falhou:", (error as Error).message);
  process.exit(1);
});

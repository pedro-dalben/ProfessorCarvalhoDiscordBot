import "dotenv/config";
import { createDatabaseClient } from "../packages/database/src/client.js";

/* eslint-disable no-console */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }
  const serverId = process.env.BIGMONCRAFT_SERVER_ID ?? "bigmoncraft";

  const { db, pool } = createDatabaseClient({
    connectionString,
    poolMax: 1,
    connectionTimeoutMs: 5000,
    statementTimeoutMs: 10000,
  });

  try {
    await runDoctor(pool, serverId);
  } finally {
    await pool.end();
  }
}

async function runDoctor(
  pool: ReturnType<typeof createDatabaseClient>["pool"],
  serverId: string,
): Promise<void> {
  console.log("Player Journey Doctor\n");
  console.log(`Server: ${serverId}\n`);

  console.log("Gateway:");
  try {
    const result = await pool.query(
      `SELECT server_id, last_heartbeat_at, gateway_version FROM gateway_servers WHERE server_id = $1`,
      [serverId],
    );
    if (result.rows[0]) {
      const row = result.rows[0];
      const age = Math.floor(
        (Date.now() - new Date(row.last_heartbeat_at).getTime()) / 1000,
      );
      console.log(`  ${age < 90 ? "ONLINE" : "OFFLINE"} (heartbeat ${age}s ago, v${row.version})`);
    } else {
      console.log("  OFFLINE (no heartbeat received)");
    }
  } catch (err) {
    console.log(`  UNKNOWN (${(err as Error).message})`);
  }

  console.log("\nEvent Coverage:");
  const eventTypes = [
    "player.session.started",
    "player.session.ended",
    "player.profile.snapshot",
    "pokemon.capture.completed",
    "pokemon.evolution.completed",
    "pokemon.rare.spawned",
    "pokemon.rare.in_battle",
    "pokemon.rare.captured",
    "pokemon.rare.defeated",
    "pokemon.rare.despawned",
  ];

  for (const eventType of eventTypes) {
    const result = await pool.query(
      `SELECT count(*)::int as cnt, max(occurred_at) as last_seen
       FROM game_events
       WHERE event_type = $1 AND server_id = $2`,
      [eventType, serverId],
    );
    const cnt = result.rows[0].cnt;
    const last = result.rows[0].last_seen;
    const label = eventType.split(".").slice(1).join(".");
    const mark = cnt > 0 ? " YES" : " ---";
    const lastStr = last ? ` last ${new Date(last).toISOString()}` : "";
    console.log(`  [${mark}] ${label}: ${cnt}${lastStr}`);
  }

  console.log("\nProjections:");
  const entries = await pool.query("SELECT count(*)::int as cnt FROM player_journey_entries");
  const stats = await pool.query("SELECT count(*)::int as cnt FROM player_journey_stats");
  const species = await pool.query("SELECT count(*)::int as cnt FROM player_captured_species");
  const totalEvents = await pool.query(
    "SELECT count(*)::int as cnt FROM game_events WHERE server_id = $1",
    [serverId],
  );

  console.log(`  Journey entries: ${entries.rows[0].cnt}`);
  console.log(`  Player stats: ${stats.rows[0].cnt}`);
  console.log(`  Captured species: ${species.rows[0].cnt}`);
  console.log(`  Total game events: ${totalEvents.rows[0].cnt}`);

  console.log("\nIntegrity:");
  const backfilled = await pool.query(
    "SELECT count(*)::int as cnt FROM game_events WHERE backfilled = true",
  );
  const unresolved = await pool.query(
    `SELECT count(*)::int as cnt FROM game_events
     WHERE event_type = 'pokemon.rare.captured'
       AND minecraft_uuid IS NULL AND server_id = $1`,
    [serverId],
  );
  const failed = await pool.query(
    "SELECT count(*)::int as cnt FROM gateway_events WHERE status = 'failed' AND server_id = $1",
    [serverId],
  );

  console.log(`  Backfilled events: ${backfilled.rows[0].cnt}`);
  console.log(`  Unresolved rare captures: ${unresolved.rows[0].cnt}`);
  console.log(`  Failed gateway events: ${failed.rows[0].cnt}`);

  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Doctor failed:", (error as Error).message);
  process.exit(1);
});

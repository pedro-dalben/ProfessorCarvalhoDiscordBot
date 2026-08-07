import "dotenv/config";
import pg from "pg";

/* eslint-disable no-console */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }
  const serverId = process.env.BIGMONCRAFT_SERVER_ID ?? "bigmoncraft";

  const pool = new pg.Pool({ connectionString, max: 1 });

  try {
    await runDoctor(pool, serverId);
  } finally {
    await pool.end();
  }
}

async function runDoctor(
  pool: pg.Pool,
  serverId: string,
): Promise<void> {
  console.log("Player Journey Doctor\n");
  console.log(`Server: ${serverId}\n`);

  let gatewayOk = false;
  try {
    const result = await pool.query(
      `SELECT count(*) as cnt FROM gateway_servers WHERE server_id = $1`,
      [serverId],
    );
    const cnt = Number(result.rows[0]?.cnt ?? 0);
    gatewayOk = cnt > 0;

    const heartbeat = await pool.query(
      `SELECT last_heartbeat_at FROM gateway_servers WHERE server_id = $1`,
      [serverId],
    );
    if (heartbeat.rows[0]?.last_heartbeat_at) {
      const age = Math.floor(
        (Date.now() - new Date(heartbeat.rows[0].last_heartbeat_at).getTime()) / 1000,
      );
      console.log(
        `Gateway: ${gatewayOk ? "ONLINE" : "OFFLINE"} (heartbeat ${age}s ago)`,
      );
    } else {
      console.log(`Gateway: ${gatewayOk ? "ONLINE" : "OFFLINE"}`);
    }
  } catch {
    console.log("Gateway: UNKNOWN (query error)");
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
      `SELECT count(*) as cnt, max(occurred_at) as last_seen
       FROM game_events
       WHERE event_type = $1 AND server_id = $2`,
      [eventType, serverId],
    );
    const cnt = Number(result.rows[0]?.cnt ?? 0);
    const lastSeen = result.rows[0]?.last_seen as string | null;
    const label = eventType.split(".").slice(1).join(".");
    const mark = cnt > 0 ? "YES" : (gatewayOk ? "WAITING" : "NO_DATA");
    console.log(`  ${label}: ${cnt} events (${mark})${lastSeen ? ` last ${new Date(lastSeen).toISOString()}` : ""}`);
  }

  console.log("\nProjections:");

  const entryCount = await pool.query(`SELECT count(*) as cnt FROM player_journey_entries`);
  const statsCount = await pool.query(`SELECT count(*) as cnt FROM player_journey_stats`);
  const speciesCount = await pool.query(`SELECT count(*) as cnt FROM player_captured_species`);
  const totalEvents = await pool.query(`SELECT count(*) as cnt FROM game_events WHERE server_id = $1`, [serverId]);

  console.log(`  Journey entries: ${entryCount.rows[0].cnt}`);
  console.log(`  Player stats: ${statsCount.rows[0].cnt}`);
  console.log(`  Captured species: ${speciesCount.rows[0].cnt}`);
  console.log(`  Total game events: ${totalEvents.rows[0].cnt}`);

  console.log("\nIntegrity:");

  const duplicateQuery = await pool.query(
    `SELECT source, count(*) as cnt
     FROM game_events
     WHERE server_id = $1
     GROUP BY source
     HAVING count(*) > 1`,
    [serverId],
  );
  const totalSources = duplicateQuery.rows.length;

  const unresolvedRareResult = await pool.query(
    `SELECT count(*) as cnt
     FROM game_events
     WHERE event_type = 'pokemon.rare.captured'
       AND minecraft_uuid IS NULL
       AND server_id = $1`,
    [serverId],
  );
  const unresolvedRare = Number(unresolvedRareResult.rows[0]?.cnt ?? 0);

  const backfilledResult = await pool.query(
    `SELECT count(*) as cnt FROM game_events WHERE backfilled = true`,
  );
  const backfilled = Number(backfilledResult.rows[0]?.cnt ?? 0);

  const failedResult = await pool.query(
    `SELECT count(*) as cnt FROM gateway_events WHERE status = 'failed' AND server_id = $1`,
    [serverId],
  );
  const failed = Number(failedResult.rows[0]?.cnt ?? 0);

  console.log(`  Duplicate sources: ${totalSources}`);
  console.log(`  Unresolved rare captures: ${unresolvedRare}`);
  console.log(`  Backfilled events: ${backfilled}`);
  console.log(`  Failed gateway events: ${failed}`);

  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Doctor failed:", (error as Error).message);
  process.exit(1);
});

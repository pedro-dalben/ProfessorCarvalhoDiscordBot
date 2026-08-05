import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const guildSettings = pgTable(
  "guild_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    locale: text("locale").default("pt-BR"),
    timezone: text("timezone").default("America/Sao_Paulo"),
    spawnAlertChannelId: text("spawn_alert_channel_id"),
    privateSpawnAlertChannelId: text("private_spawn_alert_channel_id"),
    coordinatePolicy: text("coordinate_policy").default("hidden"),
    showNearestPlayer: boolean("show_nearest_player").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    guildUnique: uniqueIndex("guild_settings_guild_id_unique").on(table.guildId),
  }),
);

export const integrationSources = pgTable("integration_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceKey: text("source_key").notNull().unique(),
  displayName: text("display_name").notNull(),
  integrationType: text("integration_type").notNull().default("csa"),
  enabled: boolean("enabled").default(true),
  tokenHash: text("token_hash"),
  serverId: text("server_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const integrationEvents = pgTable(
  "integration_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => integrationSources.id),
    requestId: text("request_id"),
    fingerprint: text("fingerprint").notNull(),
    eventType: text("event_type").notNull().default("spawn"),
    schemaVersion: text("schema_version"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    status: text("status").notNull().default("received"),
    sanitizedPayload: jsonb("sanitized_payload"),
    errorCode: text("error_code"),
    retryCount: integer("retry_count").default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    fingerprintIdx: index("integration_events_fingerprint_idx").on(table.fingerprint),
    receivedAtIdx: index("integration_events_received_at_idx").on(table.receivedAt),
    statusIdx: index("integration_events_status_idx").on(table.status),
    sourceIdIdx: index("integration_events_source_id_idx").on(table.sourceId),
  }),
);

export const spawnEvents = pgTable(
  "spawn_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationEventId: uuid("integration_event_id").references(() => integrationEvents.id),
    serverId: text("server_id").notNull(),
    species: text("species"),
    form: text("form"),
    dexNumber: integer("dex_number"),
    level: integer("level"),
    shiny: boolean("shiny").default(false),
    legendary: boolean("legendary").default(false),
    mythical: boolean("mythical").default(false),
    ultraBeast: boolean("ultra_beast").default(false),
    paradox: boolean("paradox").default(false),
    rarity: text("rarity"),
    bucket: text("bucket"),
    biome: text("biome"),
    dimension: text("dimension"),
    coordinateRegion: text("coordinate_region"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    integrationEventUnique: uniqueIndex("spawn_events_integration_event_id_unique").on(
      table.integrationEventId,
    ),
  }),
);

export const commandUsageDaily = pgTable(
  "command_usage_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usageDate: timestamp("usage_date", { withTimezone: true, mode: "date" }).notNull(),
    guildId: text("guild_id").notNull(),
    commandName: text("command_name").notNull(),
    successCount: integer("success_count").default(0),
    errorCount: integer("error_count").default(0),
    averageDurationMs: integer("average_duration_ms").default(0),
  },
  (table) => ({
    dailyUnique: uniqueIndex("command_usage_daily_unique").on(
      table.usageDate,
      table.guildId,
      table.commandName,
    ),
  }),
);

export const workerHeartbeats = pgTable(
  "worker_heartbeats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workerName: text("worker_name").notNull(),
    instanceId: text("instance_id").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    workerUnique: uniqueIndex("worker_heartbeats_worker_unique").on(
      table.workerName,
      table.instanceId,
    ),
  }),
);

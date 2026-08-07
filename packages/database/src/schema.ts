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
  expectedVersion: text("expected_version"),
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
    normalizedPayload: jsonb("normalized_payload"),
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
    externalSpawnAlertId: text("external_spawn_alert_id"),
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
    lifecycleStatus: text("lifecycle_status").default("SPAWNED"),
    lifecycleRevision: integer("lifecycle_revision").default(1),
    spawnOrigin: text("spawn_origin"),
    worldKey: text("world_key"),
    worldDisplayName: text("world_display_name"),
    dimensionKey: text("dimension_key"),
    locationVisibility: text("location_visibility"),
    alertReasons: jsonb("alert_reasons"),
    matchedRuleIds: jsonb("matched_rule_ids"),
    involvedPlayerName: text("involved_player_name"),
    spawnedAt: timestamp("spawned_at", { withTimezone: true }),
    lastLifecycleAt: timestamp("last_lifecycle_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    discordChannelId: text("discord_channel_id"),
    deliveryStatus: text("delivery_status").notNull().default("pending"),
    deliveryAttempts: integer("delivery_attempts").notNull().default(0),
    discordMessageId: text("discord_message_id"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastDeliveryError: text("last_delivery_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    integrationEventUnique: uniqueIndex("spawn_events_integration_event_id_unique").on(
      table.integrationEventId,
    ),
    externalSpawnAlertIdIdx: index("spawn_events_external_spawn_alert_id_idx").on(
      table.externalSpawnAlertId,
    ),
    lifecycleStatusIdx: index("spawn_events_lifecycle_status_idx").on(table.lifecycleStatus),
    serverExternalUnique: uniqueIndex("spawn_events_server_external_unique").on(
      table.serverId,
      table.externalSpawnAlertId,
    ),
  }),
);

export const spawnLifecycleHistory = pgTable(
  "spawn_lifecycle_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spawnEventId: uuid("spawn_event_id")
      .notNull()
      .references(() => spawnEvents.id),
    externalSpawnAlertId: text("external_spawn_alert_id").notNull(),
    status: text("status").notNull(),
    revision: integer("revision").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    playerName: text("player_name"),
    payloadHash: text("payload_hash"),
    normalizedPayload: jsonb("normalized_payload"),
    applied: boolean("applied").default(true),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    spawnEventIdIdx: index("lifecycle_history_spawn_event_id_idx").on(table.spawnEventId),
    externalAlertIdIdx: index("lifecycle_history_external_alert_id_idx").on(
      table.externalSpawnAlertId,
    ),
    statusIdx: index("lifecycle_history_status_idx").on(table.status),
    occurredAtIdx: index("lifecycle_history_occurred_at_idx").on(table.occurredAt),
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

export const identityLinks = pgTable("identity_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  discordUserId: text("discord_user_id").notNull(),
  guildId: text("guild_id").notNull(),
  minecraftUuid: uuid("minecraft_uuid").notNull(),
  minecraftName: text("minecraft_name").notNull(),
  serverId: text("server_id").notNull(),
  status: text("status").notNull().default("active"),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
  unlinkedBy: text("unlinked_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const identityLinkCodes = pgTable("identity_link_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeHash: text("code_hash").notNull().unique(),
  discordUserId: text("discord_user_id").notNull(),
  guildId: text("guild_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  attemptCount: integer("attempt_count").notNull().default(0),
  maximumAttempts: integer("maximum_attempts").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const identityLinkAudit = pgTable("identity_link_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  linkId: uuid("link_id"),
  action: text("action").notNull(),
  discordUserId: text("discord_user_id"),
  minecraftUuid: uuid("minecraft_uuid"),
  serverId: text("server_id").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  reason: text("reason"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gatewayEvents = pgTable("gateway_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().unique(),
  requestId: uuid("request_id").notNull(),
  serverId: text("server_id").notNull(),
  eventType: text("event_type").notNull(),
  schemaVersion: text("schema_version").notNull(),
  bodyHash: text("body_hash").notNull(),
  status: text("status").notNull(),
  payload: jsonb("payload").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorCode: text("error_code"),
});

export const gatewayServers = pgTable("gateway_servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: text("server_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  protocolVersion: text("protocol_version").notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  gatewayVersion: text("gateway_version"),
  minecraftVersion: text("minecraft_version"),
  fabricVersion: text("fabric_version"),
  cobblemonVersion: text("cobblemon_version"),
  bigbangessentialsVersion: text("bigbangessentials_version"),
  statusPayload: jsonb("status_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerProfileSnapshots = pgTable(
  "player_profile_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    linkId: uuid("link_id").notNull(),
    minecraftUuid: uuid("minecraft_uuid").notNull(),
    minecraftName: text("minecraft_name").notNull(),
    serverId: text("server_id").notNull(),
    snapshotVersion: text("snapshot_version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    gatewayVersion: text("gateway_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    linkServerUnique: uniqueIndex("player_profile_snapshots_link_server_unique").on(
      table.linkId,
      table.serverId,
    ),
  }),
);

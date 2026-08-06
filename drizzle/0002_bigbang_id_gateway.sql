CREATE TABLE IF NOT EXISTS "identity_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "discord_user_id" text NOT NULL,
  "guild_id" text NOT NULL,
  "minecraft_uuid" uuid NOT NULL,
  "minecraft_name" text NOT NULL,
  "server_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "linked_at" timestamptz NOT NULL DEFAULT now(),
  "unlinked_at" timestamptz,
  "unlinked_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_links_status_check CHECK ("status" IN ('active', 'inactive', 'blocked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "identity_links_active_discord_unique"
  ON "identity_links" ("discord_user_id") WHERE "status" = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS "identity_links_active_minecraft_unique"
  ON "identity_links" ("minecraft_uuid") WHERE "status" = 'active';

CREATE TABLE IF NOT EXISTS "identity_link_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code_hash" text UNIQUE NOT NULL,
  "discord_user_id" text NOT NULL,
  "guild_id" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "maximum_attempts" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "identity_link_codes_user_active_idx"
  ON "identity_link_codes" ("discord_user_id", "created_at")
  WHERE "consumed_at" IS NULL;

CREATE TABLE IF NOT EXISTS "identity_link_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "link_id" uuid,
  "action" text NOT NULL,
  "discord_user_id" text,
  "minecraft_uuid" uuid,
  "server_id" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "reason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "gateway_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid UNIQUE NOT NULL,
  "request_id" uuid NOT NULL,
  "server_id" text NOT NULL,
  "event_type" text NOT NULL,
  "schema_version" text NOT NULL,
  "body_hash" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz,
  "error_code" text
);
CREATE INDEX IF NOT EXISTS "gateway_events_received_at_idx" ON "gateway_events" ("received_at");

CREATE TABLE IF NOT EXISTS "gateway_servers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "server_id" text UNIQUE NOT NULL,
  "display_name" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "protocol_version" text NOT NULL,
  "last_heartbeat_at" timestamptz,
  "gateway_version" text,
  "minecraft_version" text,
  "fabric_version" text,
  "cobblemon_version" text,
  "bigbangessentials_version" text,
  "status_payload" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "player_profile_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "link_id" uuid NOT NULL,
  "minecraft_uuid" uuid NOT NULL,
  "minecraft_name" text NOT NULL,
  "server_id" text NOT NULL,
  "snapshot_version" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "captured_at" timestamptz NOT NULL,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "gateway_version" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_profile_snapshots_link_server_unique UNIQUE ("link_id", "server_id")
);

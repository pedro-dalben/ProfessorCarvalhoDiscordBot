CREATE TABLE "gateway_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"server_id" text NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" text NOT NULL,
	"body_hash" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error_code" text,
	CONSTRAINT "gateway_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "gateway_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"protocol_version" text NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"gateway_version" text,
	"minecraft_version" text,
	"fabric_version" text,
	"cobblemon_version" text,
	"bigbangessentials_version" text,
	"status_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateway_servers_server_id_unique" UNIQUE("server_id")
);
--> statement-breakpoint
CREATE TABLE "identity_link_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid,
	"action" text NOT NULL,
	"discord_user_id" text,
	"minecraft_uuid" uuid,
	"server_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_link_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"discord_user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_link_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "identity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"minecraft_uuid" uuid NOT NULL,
	"minecraft_name" text NOT NULL,
	"server_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone,
	"unlinked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_profile_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"minecraft_uuid" uuid NOT NULL,
	"minecraft_name" text NOT NULL,
	"server_id" text NOT NULL,
	"snapshot_version" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"gateway_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spawn_lifecycle_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spawn_event_id" uuid NOT NULL,
	"external_spawn_alert_id" text NOT NULL,
	"status" text NOT NULL,
	"revision" integer NOT NULL,
	"occurred_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"player_name" text,
	"payload_hash" text,
	"normalized_payload" jsonb,
	"applied" boolean DEFAULT true,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "external_spawn_alert_id" text;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "lifecycle_status" text DEFAULT 'SPAWNED';--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "lifecycle_revision" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "spawn_origin" text;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "world_key" text;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "world_display_name" text;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "dimension_key" text;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "location_visibility" text;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "alert_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "matched_rule_ids" jsonb;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "involved_player_name" text;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "spawned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "last_lifecycle_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "discord_channel_id" text;--> statement-breakpoint
ALTER TABLE "spawn_lifecycle_history" ADD CONSTRAINT "spawn_lifecycle_history_spawn_event_id_spawn_events_id_fk" FOREIGN KEY ("spawn_event_id") REFERENCES "public"."spawn_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_profile_snapshots_link_server_unique" ON "player_profile_snapshots" USING btree ("link_id","server_id");--> statement-breakpoint
CREATE INDEX "lifecycle_history_spawn_event_id_idx" ON "spawn_lifecycle_history" USING btree ("spawn_event_id");--> statement-breakpoint
CREATE INDEX "lifecycle_history_external_alert_id_idx" ON "spawn_lifecycle_history" USING btree ("external_spawn_alert_id");--> statement-breakpoint
CREATE INDEX "lifecycle_history_status_idx" ON "spawn_lifecycle_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lifecycle_history_occurred_at_idx" ON "spawn_lifecycle_history" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "spawn_events_external_spawn_alert_id_idx" ON "spawn_events" USING btree ("external_spawn_alert_id");--> statement-breakpoint
CREATE INDEX "spawn_events_lifecycle_status_idx" ON "spawn_events" USING btree ("lifecycle_status");--> statement-breakpoint
CREATE UNIQUE INDEX "spawn_events_server_external_unique" ON "spawn_events" USING btree ("server_id","external_spawn_alert_id");
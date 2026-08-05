CREATE TABLE "command_usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usage_date" timestamp with time zone NOT NULL,
	"guild_id" text NOT NULL,
	"command_name" text NOT NULL,
	"success_count" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"average_duration_ms" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "guild_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"locale" text DEFAULT 'pt-BR',
	"timezone" text DEFAULT 'America/Sao_Paulo',
	"spawn_alert_channel_id" text,
	"private_spawn_alert_channel_id" text,
	"coordinate_policy" text DEFAULT 'hidden',
	"show_nearest_player" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"request_id" text,
	"fingerprint" text NOT NULL,
	"event_type" text DEFAULT 'spawn' NOT NULL,
	"schema_version" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" text DEFAULT 'received' NOT NULL,
	"sanitized_payload" jsonb,
	"error_code" text,
	"retry_count" integer DEFAULT 0,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integration_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"display_name" text NOT NULL,
	"integration_type" text DEFAULT 'csa' NOT NULL,
	"enabled" boolean DEFAULT true,
	"token_hash" text,
	"server_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "integration_sources_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "spawn_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_event_id" uuid,
	"server_id" text NOT NULL,
	"species" text,
	"form" text,
	"dex_number" integer,
	"level" integer,
	"shiny" boolean DEFAULT false,
	"legendary" boolean DEFAULT false,
	"mythical" boolean DEFAULT false,
	"ultra_beast" boolean DEFAULT false,
	"paradox" boolean DEFAULT false,
	"rarity" text,
	"bucket" text,
	"biome" text,
	"dimension" text,
	"coordinate_region" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_name" text NOT NULL,
	"instance_id" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_source_id_integration_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."integration_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD CONSTRAINT "spawn_events_integration_event_id_integration_events_id_fk" FOREIGN KEY ("integration_event_id") REFERENCES "public"."integration_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "command_usage_daily_unique" ON "command_usage_daily" USING btree ("usage_date","guild_id","command_name");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_settings_guild_id_unique" ON "guild_settings" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "integration_events_fingerprint_idx" ON "integration_events" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "integration_events_received_at_idx" ON "integration_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "integration_events_status_idx" ON "integration_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "integration_events_source_id_idx" ON "integration_events" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spawn_events_integration_event_id_unique" ON "spawn_events" USING btree ("integration_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_heartbeats_worker_unique" ON "worker_heartbeats" USING btree ("worker_name","instance_id");
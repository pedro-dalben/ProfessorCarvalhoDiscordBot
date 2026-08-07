CREATE TABLE "game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" text DEFAULT '1.0' NOT NULL,
	"server_id" text NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text,
	"minecraft_uuid" uuid,
	"identity_link_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"backfilled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX "game_events_event_id_unique" ON "game_events" USING btree ("event_id");
CREATE INDEX "game_events_source_event_idx" ON "game_events" USING btree ("source","source_event_id");
CREATE INDEX "game_events_minecraft_uuid_idx" ON "game_events" USING btree ("minecraft_uuid");
CREATE INDEX "game_events_identity_link_id_idx" ON "game_events" USING btree ("identity_link_id");
CREATE INDEX "game_events_event_type_idx" ON "game_events" USING btree ("event_type");
CREATE INDEX "game_events_occurred_at_idx" ON "game_events" USING btree ("occurred_at");
CREATE INDEX "game_events_server_id_idx" ON "game_events" USING btree ("server_id");

CREATE TABLE "player_journey_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_link_id" uuid,
	"minecraft_uuid" uuid NOT NULL,
	"game_event_id" uuid REFERENCES "game_events"("id"),
	"entry_type" text NOT NULL,
	"title" text,
	"description_key" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX "journey_entries_minecraft_uuid_idx" ON "player_journey_entries" USING btree ("minecraft_uuid");
CREATE INDEX "journey_entries_identity_link_id_idx" ON "player_journey_entries" USING btree ("identity_link_id");
CREATE INDEX "journey_entries_entry_type_idx" ON "player_journey_entries" USING btree ("entry_type");
CREATE INDEX "journey_entries_occurred_at_idx" ON "player_journey_entries" USING btree ("occurred_at");
CREATE INDEX "journey_entries_game_event_id_idx" ON "player_journey_entries" USING btree ("game_event_id");

CREATE TABLE "player_journey_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid,
	"minecraft_uuid" uuid NOT NULL,
	"minecraft_name" text NOT NULL,
	"total_captures" integer DEFAULT 0 NOT NULL,
	"unique_species_captured" integer DEFAULT 0 NOT NULL,
	"shiny_captures" integer DEFAULT 0 NOT NULL,
	"legendary_captures" integer DEFAULT 0 NOT NULL,
	"mythical_captures" integer DEFAULT 0 NOT NULL,
	"rare_captures" integer DEFAULT 0 NOT NULL,
	"rare_encounters" integer DEFAULT 0 NOT NULL,
	"rare_defeated" integer DEFAULT 0 NOT NULL,
	"rare_despawned" integer DEFAULT 0 NOT NULL,
	"total_playtime" double precision DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"evolutions" integer DEFAULT 0 NOT NULL,
	"trades" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"most_captured_species" text,
	"rarest_captured_species" text,
	"last_captured_species" text,
	"last_shiny_species" text,
	"last_legendary_species" text,
	"fastest_rare_capture_seconds" double precision,
	"total_rare_capture_time_seconds" double precision DEFAULT 0 NOT NULL,
	"rare_capture_count" integer DEFAULT 0 NOT NULL,
	"last_pokedex_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "journey_stats_minecraft_uuid_unique" ON "player_journey_stats" USING btree ("minecraft_uuid");
CREATE INDEX "journey_stats_link_id_idx" ON "player_journey_stats" USING btree ("link_id");

CREATE TABLE "player_captured_species" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minecraft_uuid" uuid NOT NULL,
	"species" text NOT NULL,
	"first_captured_at" timestamp with time zone NOT NULL,
	"capture_count" integer DEFAULT 1 NOT NULL
);

CREATE UNIQUE INDEX "captured_species_uuid_species_unique" ON "player_captured_species" USING btree ("minecraft_uuid","species");

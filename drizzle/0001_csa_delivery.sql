ALTER TABLE "integration_events" ADD COLUMN "normalized_payload" jsonb;--> statement-breakpoint
ALTER TABLE "integration_sources" ADD COLUMN "expected_version" text;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "delivery_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "delivery_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "discord_message_id" text;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spawn_events" ADD COLUMN "last_delivery_error" text;
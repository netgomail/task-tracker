CREATE TABLE "sync_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "obsidian_path" text;--> statement-breakpoint
ALTER TABLE "sync_tokens" ADD CONSTRAINT "sync_tokens_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_tokens" ADD CONSTRAINT "sync_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_tokens_hash_uidx" ON "sync_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sync_tokens_ws_idx" ON "sync_tokens" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sync_tokens_user_idx" ON "sync_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_obsidian_path_idx" ON "tasks" USING btree ("workspace_id","obsidian_path");
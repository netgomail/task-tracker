CREATE TABLE "task_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_task_id" text NOT NULL,
	"target_task_id" text NOT NULL,
	"type" text DEFAULT 'requires' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_links_type_chk" CHECK ("task_links"."type" in ('requires','approves','complements','relates')),
	CONSTRAINT "task_links_no_self_chk" CHECK ("task_links"."source_task_id" <> "task_links"."target_task_id")
);
--> statement-breakpoint
CREATE TABLE "document_set_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT 'slate' NOT NULL,
	"items" text NOT NULL,
	"links" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_type_chk";--> statement-breakpoint
ALTER TABLE "task_templates" DROP CONSTRAINT "task_templates_type_chk";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "type" SET DEFAULT 'order';--> statement-breakpoint
ALTER TABLE "task_templates" ALTER COLUMN "type" SET DEFAULT 'order';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_source_fk" FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_target_fk" FOREIGN KEY ("target_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_set_templates" ADD CONSTRAINT "document_set_templates_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_set_templates" ADD CONSTRAINT "document_set_templates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_links_uidx" ON "task_links" USING btree ("source_task_id","target_task_id","type");--> statement-breakpoint
CREATE INDEX "task_links_source_idx" ON "task_links" USING btree ("source_task_id");--> statement-breakpoint
CREATE INDEX "task_links_target_idx" ON "task_links" USING btree ("target_task_id");--> statement-breakpoint
CREATE INDEX "document_set_templates_ws_idx" ON "document_set_templates" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_type_chk" CHECK ("tasks"."type" in ('order','instruction','regulation','policy','plan','journal','list','consent','job_description','act','model','other'));--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_type_chk" CHECK ("task_templates"."type" in ('order','instruction','regulation','policy','plan','journal','list','consent','job_description','act','model','other'));
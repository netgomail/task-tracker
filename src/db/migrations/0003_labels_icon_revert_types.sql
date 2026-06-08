ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_type_chk";--> statement-breakpoint
ALTER TABLE "task_templates" DROP CONSTRAINT IF EXISTS "task_templates_type_chk";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "type" SET DEFAULT 'task';--> statement-breakpoint
ALTER TABLE "task_templates" ALTER COLUMN "type" SET DEFAULT 'task';--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN IF NOT EXISTS "icon" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_type_chk" CHECK ("tasks"."type" in ('task','bug','feature','chore'));--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_type_chk" CHECK ("task_templates"."type" in ('task','bug','feature','chore'));

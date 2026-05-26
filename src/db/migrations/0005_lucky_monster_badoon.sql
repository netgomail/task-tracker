CREATE TABLE `task_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'task' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`color` text DEFAULT 'slate' NOT NULL,
	`labels` text,
	`subtasks` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "task_templates_type_chk" CHECK("task_templates"."type" in ('task','bug','feature','chore')),
	CONSTRAINT "task_templates_priority_chk" CHECK("task_templates"."priority" in ('low','normal','high','urgent'))
);
--> statement-breakpoint
CREATE INDEX `task_templates_ws_idx` ON `task_templates` (`workspace_id`);
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`column_id` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'task' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`color` text DEFAULT 'slate' NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`order_key` text NOT NULL,
	`created_by` text NOT NULL,
	`assignee_id` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`column_id`) REFERENCES `columns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tasks_type_chk" CHECK("tasks"."type" in ('task','bug','feature','chore')),
	CONSTRAINT "tasks_priority_chk" CHECK("tasks"."priority" in ('low','normal','high','urgent'))
);
--> statement-breakpoint
CREATE INDEX `tasks_col_order_idx` ON `tasks` (`workspace_id`,`column_id`,`order_key`);--> statement-breakpoint
CREATE INDEX `tasks_project_archived_idx` ON `tasks` (`workspace_id`,`project_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_id`);
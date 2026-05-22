CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'slate' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `labels_ws_idx` ON `labels` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `labels_ws_name_uidx` ON `labels` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `task_labels` (
	`task_id` text NOT NULL,
	`label_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`task_id`, `label_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_labels_label_idx` ON `task_labels` (`label_id`);--> statement-breakpoint
CREATE VIRTUAL TABLE `tasks_fts` USING fts5(
  title,
  description,
  content='tasks',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);--> statement-breakpoint
INSERT INTO `tasks_fts`(`rowid`, `title`, `description`)
  SELECT `rowid`, `title`, COALESCE(`description`, '') FROM `tasks`;--> statement-breakpoint
CREATE TRIGGER `tasks_fts_ai` AFTER INSERT ON `tasks` BEGIN
  INSERT INTO `tasks_fts`(`rowid`, `title`, `description`)
  VALUES (new.`rowid`, new.`title`, COALESCE(new.`description`, ''));
END;--> statement-breakpoint
CREATE TRIGGER `tasks_fts_ad` AFTER DELETE ON `tasks` BEGIN
  INSERT INTO `tasks_fts`(`tasks_fts`, `rowid`, `title`, `description`)
  VALUES ('delete', old.`rowid`, old.`title`, COALESCE(old.`description`, ''));
END;--> statement-breakpoint
CREATE TRIGGER `tasks_fts_au` AFTER UPDATE ON `tasks` BEGIN
  INSERT INTO `tasks_fts`(`tasks_fts`, `rowid`, `title`, `description`)
  VALUES ('delete', old.`rowid`, old.`title`, COALESCE(old.`description`, ''));
  INSERT INTO `tasks_fts`(`rowid`, `title`, `description`)
  VALUES (new.`rowid`, new.`title`, COALESCE(new.`description`, ''));
END;
import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { organization, user } from "./auth";
import { tasks } from "./tasks";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (t) => [index("attachments_task_idx").on(t.workspaceId, t.taskId)],
);

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  workspace: one(organization, {
    fields: [attachments.workspaceId],
    references: [organization.id],
  }),
  task: one(tasks, {
    fields: [attachments.taskId],
    references: [tasks.id],
  }),
  uploader: one(user, {
    fields: [attachments.uploadedBy],
    references: [user.id],
  }),
}));

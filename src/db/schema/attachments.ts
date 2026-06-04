import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { tasks } from "./tasks";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const attachments = pgTable(
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
    createdAt: ts("created_at").defaultNow().notNull(),
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

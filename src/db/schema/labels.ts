import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { organization } from "./auth";
import { tasks } from "./tasks";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const labels = sqliteTable(
  "labels",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (t) => [
    index("labels_ws_idx").on(t.workspaceId),
    uniqueIndex("labels_ws_name_uidx").on(t.workspaceId, t.name),
  ],
);

export const taskLabels = sqliteTable(
  "task_labels",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.labelId] }),
    index("task_labels_label_idx").on(t.labelId),
  ],
);

export const labelsRelations = relations(labels, ({ one, many }) => ({
  workspace: one(organization, {
    fields: [labels.workspaceId],
    references: [organization.id],
  }),
  taskLabels: many(taskLabels),
}));

export const taskLabelsRelations = relations(taskLabels, ({ one }) => ({
  task: one(tasks, { fields: [taskLabels.taskId], references: [tasks.id] }),
  label: one(labels, { fields: [taskLabels.labelId], references: [labels.id] }),
}));

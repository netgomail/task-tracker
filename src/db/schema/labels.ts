import { relations } from "drizzle-orm";
import { index, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { tasks } from "./tasks";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const labels = pgTable(
  "labels",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("labels_ws_idx").on(t.workspaceId),
    uniqueIndex("labels_ws_name_uidx").on(t.workspaceId, t.name),
  ],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").defaultNow().notNull(),
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

import { relations, sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { projects } from "./projects";
import { tasks } from "./tasks";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const customFieldDefs = pgTable(
  "custom_field_defs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    /** JSON для type='select': [{ value, label, color }]. */
    options: text("options"),
    required: boolean("required").default(false).notNull(),
    orderKey: text("order_key").notNull(),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("custom_field_defs_project_idx").on(t.projectId, t.orderKey),
    check(
      "custom_field_defs_type_chk",
      sql`${t.type} in ('text','number','select','date','url','checkbox')`,
    ),
  ],
);

export const customFieldValues = pgTable(
  "custom_field_values",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fieldId: text("field_id")
      .notNull()
      .references(() => customFieldDefs.id, { onDelete: "cascade" }),
    valueText: text("value_text"),
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.fieldId] }),
    index("custom_field_values_field_idx").on(t.fieldId, t.valueText),
  ],
);

export const customFieldDefsRelations = relations(customFieldDefs, ({ one, many }) => ({
  workspace: one(organization, {
    fields: [customFieldDefs.workspaceId],
    references: [organization.id],
  }),
  project: one(projects, {
    fields: [customFieldDefs.projectId],
    references: [projects.id],
  }),
  values: many(customFieldValues),
}));

export const customFieldValuesRelations = relations(customFieldValues, ({ one }) => ({
  task: one(tasks, {
    fields: [customFieldValues.taskId],
    references: [tasks.id],
  }),
  field: one(customFieldDefs, {
    fields: [customFieldValues.fieldId],
    references: [customFieldDefs.id],
  }),
}));

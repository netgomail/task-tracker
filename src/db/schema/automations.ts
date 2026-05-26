import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { organization, user } from "./auth";
import { projects } from "./projects";
import { tasks } from "./tasks";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const automations = sqliteTable(
  "automations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
    /** JSON: { type: 'task.created' | 'task.moved' | 'task.label_added', params: {...} } */
    trigger: text("trigger").notNull(),
    /** JSON: [{ key, op, value }] — AND. */
    conditions: text("conditions"),
    /** JSON: [{ type, params }] — список действий по порядку. */
    actions: text("actions").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("automations_project_idx").on(t.projectId, t.enabled)],
);

export const automationRuns = sqliteTable(
  "automation_runs",
  {
    id: text("id").primaryKey(),
    automationId: text("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** 'success' | 'error' | 'skipped' (conditions не сошлись) */
    status: text("status").notNull(),
    /** JSON: { actionsRun: number, errors: string[] } */
    details: text("details"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (t) => [index("automation_runs_automation_idx").on(t.automationId, t.createdAt)],
);

export const automationsRelations = relations(automations, ({ one, many }) => ({
  workspace: one(organization, {
    fields: [automations.workspaceId],
    references: [organization.id],
  }),
  project: one(projects, {
    fields: [automations.projectId],
    references: [projects.id],
  }),
  runs: many(automationRuns),
}));

export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
  automation: one(automations, {
    fields: [automationRuns.automationId],
    references: [automations.id],
  }),
  task: one(tasks, {
    fields: [automationRuns.taskId],
    references: [tasks.id],
  }),
}));

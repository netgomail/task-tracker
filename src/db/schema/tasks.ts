import { relations, sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { columns, projects } from "./projects";
import { taskLinks } from "./task-links";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    columnId: text("column_id")
      .notNull()
      .references(() => columns.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull().default("task"),
    priority: text("priority").notNull().default("normal"),
    color: text("color").notNull().default("slate"),
    dueAt: ts("due_at"),
    reviewAt: ts("review_at"),
    completedAt: ts("completed_at"),
    orderKey: text("order_key").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    archivedAt: ts("archived_at"),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("tasks_col_order_idx").on(t.workspaceId, t.columnId, t.orderKey),
    index("tasks_project_archived_idx").on(t.workspaceId, t.projectId, t.archivedAt),
    index("tasks_parent_idx").on(t.parentId),
    foreignKey({
      name: "tasks_parent_fk",
      columns: [t.parentId],
      foreignColumns: [t.id],
    }).onDelete("cascade"),
    check(
      "tasks_type_chk",
      sql`${t.type} in ('task','bug','feature','chore')`,
    ),
    check(
      "tasks_priority_chk",
      sql`${t.priority} in ('low','normal','high','urgent')`,
    ),
  ],
);

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  workspace: one(organization, {
    fields: [tasks.workspaceId],
    references: [organization.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  column: one(columns, {
    fields: [tasks.columnId],
    references: [columns.id],
  }),
  creator: one(user, {
    fields: [tasks.createdBy],
    references: [user.id],
  }),
  assignee: one(user, {
    fields: [tasks.assigneeId],
    references: [user.id],
  }),
  parent: one(tasks, {
    fields: [tasks.parentId],
    references: [tasks.id],
    relationName: "subtasks",
  }),
  subtasks: many(tasks, { relationName: "subtasks" }),
  outgoingLinks: many(taskLinks, { relationName: "outgoingLinks" }),
  incomingLinks: many(taskLinks, { relationName: "incomingLinks" }),
}));

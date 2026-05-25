import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { organization, user } from "./auth";
import { projects } from "./projects";
import { tasks } from "./tasks";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("comments_task_idx").on(t.taskId, t.createdAt)],
);

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    /** JSON-encoded payload, schema depends on `type`. */
    payload: text("payload"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (t) => [
    index("activity_task_idx").on(t.taskId, t.createdAt),
    index("activity_workspace_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(user, { fields: [comments.authorId], references: [user.id] }),
}));

export const activityRelations = relations(activityEvents, ({ one }) => ({
  task: one(tasks, { fields: [activityEvents.taskId], references: [tasks.id] }),
  project: one(projects, {
    fields: [activityEvents.projectId],
    references: [projects.id],
  }),
  actor: one(user, { fields: [activityEvents.actorId], references: [user.id] }),
}));

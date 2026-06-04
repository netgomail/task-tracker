import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { projects } from "./projects";
import { tasks } from "./tasks";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const comments = pgTable(
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
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("comments_task_idx").on(t.taskId, t.createdAt)],
);

export const activityEvents = pgTable(
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
    createdAt: ts("created_at").defaultNow().notNull(),
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

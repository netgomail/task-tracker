import { relations, sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { comments } from "./activity";
import { tasks } from "./tasks";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const NOTIFICATION_TYPES = ["task_assigned", "comment_mention"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    commentId: text("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    readAt: ts("read_at"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("notifications_recipient_idx").on(t.recipientId, t.readAt, t.createdAt),
    index("notifications_workspace_idx").on(t.workspaceId, t.recipientId),
    check(
      "notifications_type_chk",
      sql`${t.type} in ('task_assigned','comment_mention')`,
    ),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  workspace: one(organization, {
    fields: [notifications.workspaceId],
    references: [organization.id],
  }),
  recipient: one(user, {
    fields: [notifications.recipientId],
    references: [user.id],
  }),
  actor: one(user, {
    fields: [notifications.actorId],
    references: [user.id],
  }),
  task: one(tasks, {
    fields: [notifications.taskId],
    references: [tasks.id],
  }),
  comment: one(comments, {
    fields: [notifications.commentId],
    references: [comments.id],
  }),
}));

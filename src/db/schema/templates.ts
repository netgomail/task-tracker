import { relations, sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const taskTemplates = pgTable(
  "task_templates",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull().default("task"),
    priority: text("priority").notNull().default("normal"),
    color: text("color").notNull().default("slate"),
    // JSON-снэпшоты: id-массивы / массивы {title} — храним строкой, разбираем
    // в сервисе. Это позволяет добавлять новые поля без миграций.
    labels: text("labels"),
    subtasks: text("subtasks"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("task_templates_ws_idx").on(t.workspaceId),
    check(
      "task_templates_type_chk",
      sql`${t.type} in ('task','bug','feature','chore')`,
    ),
    check(
      "task_templates_priority_chk",
      sql`${t.priority} in ('low','normal','high','urgent')`,
    ),
  ],
);

export const taskTemplatesRelations = relations(taskTemplates, ({ one }) => ({
  workspace: one(organization, {
    fields: [taskTemplates.workspaceId],
    references: [organization.id],
  }),
  creator: one(user, {
    fields: [taskTemplates.createdBy],
    references: [user.id],
  }),
}));

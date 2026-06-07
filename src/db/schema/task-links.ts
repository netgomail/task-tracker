import { relations, sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { tasks } from "./tasks";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Связи между документами (комплектность ОРД).
 *
 *   source --type--> target
 *   requires    — source требует разработки target (приказ → инструкция)
 *   approves    — source утверждает target (приказ утверждает положение)
 *   complements — source дополняется target (см. также)
 *   relates     — нейтральная связь
 *
 * Направление значимо: на карточке target показываем обратную формулировку
 * («требуется для…», «утверждается приказом…»).
 */
export const taskLinks = pgTable(
  "task_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sourceTaskId: text("source_task_id").notNull(),
    targetTaskId: text("target_task_id").notNull(),
    type: text("type").notNull().default("requires"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("task_links_uidx").on(t.sourceTaskId, t.targetTaskId, t.type),
    index("task_links_source_idx").on(t.sourceTaskId),
    index("task_links_target_idx").on(t.targetTaskId),
    foreignKey({
      name: "task_links_source_fk",
      columns: [t.sourceTaskId],
      foreignColumns: [tasks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "task_links_target_fk",
      columns: [t.targetTaskId],
      foreignColumns: [tasks.id],
    }).onDelete("cascade"),
    check("task_links_type_chk", sql`${t.type} in ('requires','approves','complements','relates')`),
    check("task_links_no_self_chk", sql`${t.sourceTaskId} <> ${t.targetTaskId}`),
  ],
);

export const taskLinksRelations = relations(taskLinks, ({ one }) => ({
  workspace: one(organization, {
    fields: [taskLinks.workspaceId],
    references: [organization.id],
  }),
  source: one(tasks, {
    fields: [taskLinks.sourceTaskId],
    references: [tasks.id],
    relationName: "outgoingLinks",
  }),
  target: one(tasks, {
    fields: [taskLinks.targetTaskId],
    references: [tasks.id],
    relationName: "incomingLinks",
  }),
  creator: one(user, {
    fields: [taskLinks.createdBy],
    references: [user.id],
  }),
}));

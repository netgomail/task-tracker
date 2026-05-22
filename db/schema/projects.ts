import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { organization, user } from "./auth";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("slate"),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(nowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("projects_ws_slug_uidx").on(t.workspaceId, t.slug),
    index("projects_ws_archived_idx").on(t.workspaceId, t.archivedAt),
  ],
);

export const boards = sqliteTable(
  "boards",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Board"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (t) => [index("boards_project_idx").on(t.projectId)],
);

export const columns = sqliteTable(
  "columns",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
    orderKey: text("order_key").notNull(),
    wipLimit: integer("wip_limit"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (t) => [index("columns_board_order_idx").on(t.boardId, t.orderKey)],
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(organization, {
    fields: [projects.workspaceId],
    references: [organization.id],
  }),
  creator: one(user, {
    fields: [projects.createdBy],
    references: [user.id],
  }),
  boards: many(boards),
}));

export const boardsRelations = relations(boards, ({ one, many }) => ({
  project: one(projects, {
    fields: [boards.projectId],
    references: [projects.id],
  }),
  columns: many(columns),
}));

export const columnsRelations = relations(columns, ({ one }) => ({
  board: one(boards, {
    fields: [columns.boardId],
    references: [boards.id],
  }),
}));

import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Персональные токены синхронизации для Obsidian-плагина.
 *
 * Плагин шлёт `Authorization: Bearer <secret>`; в БД храним только sha-256 хэш
 * секрета (tokenHash). Долгоживущий — в отличие от 30-дневной сессии better-auth,
 * чтобы плагин не разлогинивался. Отзыв — через revokedAt (мягко, без удаления,
 * чтобы lastUsedAt оставался для аудита).
 */
export const syncTokens = pgTable(
  "sync_tokens",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("sync_tokens_hash_uidx").on(t.tokenHash),
    index("sync_tokens_ws_idx").on(t.workspaceId),
    index("sync_tokens_user_idx").on(t.userId),
  ],
);

export const syncTokensRelations = relations(syncTokens, ({ one }) => ({
  workspace: one(organization, {
    fields: [syncTokens.workspaceId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [syncTokens.userId],
    references: [user.id],
  }),
}));

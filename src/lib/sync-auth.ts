import "server-only";

import { verify, type SyncContext } from "@/services/sync-tokens";

/**
 * Аутентификация запросов от Obsidian-плагина по `Authorization: Bearer <secret>`.
 * Возвращает контекст (userId/workspaceId) валидного токена либо null.
 *
 * В отличие от cookie-сессии better-auth, токен долгоживущий — плагин не
 * разлогинивается. Роут-хендлеры синхронизации используют ТОЛЬКО этот путь,
 * не getSession.
 */
export async function verifySyncRequest(req: Request): Promise<SyncContext | null> {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const secret = match[1].trim();
  if (!secret) return null;
  return verify(secret);
}

import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { newId } from "@/lib/ids";
import { member } from "@/db/schema/auth";
import { syncTokens } from "@/db/schema/sync";

/** Контекст, который несёт валидный токен синхронизации. */
export type SyncContext = { userId: string; workspaceId: string; tokenId: string };

export type SyncTokenInfo = {
  id: string;
  name: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

const PREFIX = "obs_";

function hashToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Генерирует секрет вида `obs_<43 base64url-символа>` (32 случайных байта). */
function generateSecret(): string {
  return PREFIX + randomBytes(32).toString("base64url");
}

/**
 * Создаёт токен. Возвращает секрет в открытом виде ОДИН раз — в БД ложится
 * только sha-256 хэш. Вызывающий показывает секрет пользователю и забывает.
 */
export async function create(
  workspaceId: string,
  userId: string,
  name: string,
): Promise<{ id: string; secret: string }> {
  const id = newId();
  const secret = generateSecret();
  await db.insert(syncTokens).values({
    id,
    workspaceId,
    userId,
    name,
    tokenHash: hashToken(secret),
  });
  return { id, secret };
}

export async function listForWorkspace(workspaceId: string): Promise<SyncTokenInfo[]> {
  return db
    .select({
      id: syncTokens.id,
      name: syncTokens.name,
      lastUsedAt: syncTokens.lastUsedAt,
      revokedAt: syncTokens.revokedAt,
      createdAt: syncTokens.createdAt,
    })
    .from(syncTokens)
    .where(eq(syncTokens.workspaceId, workspaceId))
    .orderBy(desc(syncTokens.createdAt));
}

/** Мягкий отзыв (revokedAt), чтобы lastUsedAt оставался для аудита. */
export async function revoke(workspaceId: string, tokenId: string): Promise<void> {
  await db
    .update(syncTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(syncTokens.id, tokenId), eq(syncTokens.workspaceId, workspaceId)));
}

/**
 * Проверяет секрет: ищет неотозванный токен по хэшу, обновляет lastUsedAt.
 * null — токен неизвестен, отозван, либо его владелец больше не состоит
 * в workspace (токен ушедшего участника умирает вместе с членством).
 */
export async function verify(secret: string): Promise<SyncContext | null> {
  if (!secret.startsWith(PREFIX)) return null;
  const [row] = await db
    .select({
      id: syncTokens.id,
      userId: syncTokens.userId,
      workspaceId: syncTokens.workspaceId,
    })
    .from(syncTokens)
    .innerJoin(
      member,
      and(eq(member.userId, syncTokens.userId), eq(member.organizationId, syncTokens.workspaceId)),
    )
    .where(and(eq(syncTokens.tokenHash, hashToken(secret)), isNull(syncTokens.revokedAt)))
    .limit(1);
  if (!row) return null;

  // lastUsedAt — для аудита; не блокируем ответ, если апдейт почему-то упал.
  await db
    .update(syncTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(syncTokens.id, row.id))
    .catch(() => {});

  return { userId: row.userId, workspaceId: row.workspaceId, tokenId: row.id };
}

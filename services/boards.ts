import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { member } from "@/db/schema/auth";
import { boards, projects } from "@/db/schema/projects";

/**
 * Проверяет, что пользователь может читать события данной доски (это значит —
 * состоит в workspace, которому принадлежит проект доски).
 *
 * Возвращает workspaceId доски при успехе, null — если доски нет или нет доступа.
 */
export async function authorizeBoardAccess(
  userId: string,
  boardId: string,
): Promise<{ workspaceId: string } | null> {
  const [row] = await db
    .select({ workspaceId: projects.workspaceId })
    .from(boards)
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .innerJoin(
      member,
      and(eq(member.organizationId, projects.workspaceId), eq(member.userId, userId)),
    )
    .where(eq(boards.id, boardId))
    .limit(1);
  return row ?? null;
}

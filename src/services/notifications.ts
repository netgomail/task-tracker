import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { newId } from "@/lib/ids";
import { notifications, type NotificationType } from "@/db/schema/notifications";
import { tasks } from "@/db/schema/tasks";
import { projects } from "@/db/schema/projects";
import { user } from "@/db/schema/auth";

export type NotificationRow = {
  id: string;
  type: NotificationType;
  createdAt: Date;
  readAt: Date | null;
  actorName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectSlug: string | null;
};

export async function create(params: {
  workspaceId: string;
  recipientId: string;
  actorId: string | null;
  type: NotificationType;
  taskId?: string | null;
  commentId?: string | null;
}): Promise<void> {
  if (params.actorId && params.actorId === params.recipientId) return;
  await db.insert(notifications).values({
    id: newId(),
    workspaceId: params.workspaceId,
    recipientId: params.recipientId,
    actorId: params.actorId ?? null,
    type: params.type,
    taskId: params.taskId ?? null,
    commentId: params.commentId ?? null,
    createdAt: new Date(),
  });
}

export async function listForUser(
  workspaceId: string,
  userId: string,
  limit = 30,
): Promise<NotificationRow[]> {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      actorName: user.name,
      taskId: tasks.id,
      taskTitle: tasks.title,
      projectSlug: projects.slug,
    })
    .from(notifications)
    .leftJoin(user, eq(user.id, notifications.actorId))
    .leftJoin(tasks, eq(tasks.id, notifications.taskId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(notifications.workspaceId, workspaceId), eq(notifications.recipientId, userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((r) => ({ ...r, type: r.type as NotificationType }));
}

export async function unreadCount(workspaceId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.recipientId, userId),
        isNull(notifications.readAt),
      ),
    );
  return row?.count ?? 0;
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.recipientId, userId)));
}

export async function markAllRead(workspaceId: string, userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.recipientId, userId),
        isNull(notifications.readAt),
      ),
    );
}

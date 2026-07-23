"use server";

import { requireUser } from "@/lib/rbac";
import { getBySlug } from "@/services/membership";
import * as notificationsSvc from "@/services/notifications";
import type { NotificationRow } from "@/services/notifications";

export type ListNotificationsResult =
  | { ok: true; notifications: NotificationRow[]; unread: number }
  | { ok: false; error: string };

export type NotificationsActionResult = { ok: true } | { ok: false; error: string };

export async function listNotificationsAction(wsSlug: string): Promise<ListNotificationsResult> {
  const session = await requireUser();
  const ws = await getBySlug(session.user.id, wsSlug);
  if (!ws) return { ok: false, error: "Пространство не найдено" };

  const [list, unread] = await Promise.all([
    notificationsSvc.listForUser(ws.workspaceId, session.user.id),
    notificationsSvc.unreadCount(ws.workspaceId, session.user.id),
  ]);
  return { ok: true, notifications: list, unread };
}

export async function markNotificationReadAction(
  notificationId: string,
): Promise<NotificationsActionResult> {
  const session = await requireUser();
  await notificationsSvc.markRead(session.user.id, notificationId);
  return { ok: true };
}

export async function markAllNotificationsReadAction(
  wsSlug: string,
): Promise<NotificationsActionResult> {
  const session = await requireUser();
  const ws = await getBySlug(session.user.id, wsSlug);
  if (!ws) return { ok: false, error: "Пространство не найдено" };
  await notificationsSvc.markAllRead(ws.workspaceId, session.user.id);
  return { ok: true };
}

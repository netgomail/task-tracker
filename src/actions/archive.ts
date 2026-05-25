"use server";

import { revalidatePath } from "next/cache";

import { hasRole, requireUser } from "@/lib/rbac";
import { notifyBoard } from "@/lib/realtime";
import * as activity from "@/services/activity";
import * as archive from "@/services/archive";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function authorizeWorkspace(wsSlug: string) {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) throw new Error("Workspace not found");
  return { session, ws };
}

export async function restoreTaskAction(
  wsSlug: string,
  taskId: string,
): Promise<ActionResult> {
  const { session, ws } = await authorizeWorkspace(wsSlug);
  const result = await archive.restoreTask(ws.workspaceId, taskId);
  if (!result) return { ok: false, error: "Задача не найдена" };
  await activity.record({
    workspaceId: ws.workspaceId,
    taskId,
    actorId: session.user.id,
    type: "task.restore",
  });
  revalidatePath(`/w/${wsSlug}/archive`);
  revalidatePath(`/w/${wsSlug}/p/${result.projectSlug}`);
  notifyBoard(result.boardId);
  return { ok: true };
}

export async function permanentlyDeleteTaskAction(
  wsSlug: string,
  taskId: string,
): Promise<ActionResult> {
  const { session, ws } = await authorizeWorkspace(wsSlug);
  if (!hasRole(ws.role, "admin")) {
    return { ok: false, error: "Только администратор может удалять навсегда" };
  }
  // Activity-событие пишем ДО удаления — FK cascade снесёт activity_events с
  // данным task_id, но событие без task_id (только с payload) сохранится в
  // истории workspace.
  await activity.record({
    workspaceId: ws.workspaceId,
    taskId: null,
    actorId: session.user.id,
    type: "task.permanently_delete",
    payload: { taskId },
  });
  const result = await archive.permanentlyDelete(ws.workspaceId, taskId);
  if (!result) return { ok: false, error: "Задача не найдена" };
  revalidatePath(`/w/${wsSlug}/archive`);
  revalidatePath(`/w/${wsSlug}/p/${result.projectSlug}`);
  notifyBoard(result.boardId);
  return { ok: true };
}

export async function restoreProjectAction(
  wsSlug: string,
  projectId: string,
): Promise<ActionResult> {
  const { session, ws } = await authorizeWorkspace(wsSlug);
  const result = await archive.restoreProject(ws.workspaceId, projectId);
  if (!result) return { ok: false, error: "Проект не найден" };
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId,
    actorId: session.user.id,
    type: "project.restore",
  });
  revalidatePath(`/w/${wsSlug}/archive`);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

export async function permanentlyDeleteProjectAction(
  wsSlug: string,
  projectId: string,
): Promise<ActionResult> {
  const { session, ws } = await authorizeWorkspace(wsSlug);
  if (!hasRole(ws.role, "admin")) {
    return { ok: false, error: "Только администратор может удалять навсегда" };
  }
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: null,
    actorId: session.user.id,
    type: "project.permanently_delete",
    payload: { projectId },
  });
  const result = await archive.permanentlyDeleteProject(ws.workspaceId, projectId);
  if (!result) return { ok: false, error: "Проект не найден" };
  revalidatePath(`/w/${wsSlug}/archive`);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

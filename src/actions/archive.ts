"use server";

import { revalidatePath } from "next/cache";

import { authorizeWorkspace, type ActionResult } from "@/actions/_shared";
import { notifyBoard } from "@/lib/realtime";
import * as activity from "@/services/activity";
import * as archive from "@/services/archive";

export type { ActionResult };

export async function restoreTaskAction(
  wsSlug: string,
  taskId: string,
): Promise<ActionResult> {
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { session, ws } = auth;
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
  const auth = await authorizeWorkspace(wsSlug, "admin");
  if (!auth.ok) return auth;
  const { session, ws } = auth;
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
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { session, ws } = auth;
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
  const auth = await authorizeWorkspace(wsSlug, "admin");
  if (!auth.ok) return auth;
  const { session, ws } = auth;
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

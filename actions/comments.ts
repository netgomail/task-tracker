"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import * as comments from "@/services/comments";
import * as activity from "@/services/activity";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const BodySchema = z
  .string()
  .trim()
  .min(1, "Введите комментарий")
  .max(5000, "Слишком длинный комментарий");

async function authorize(wsSlug: string, projectSlug: string) {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) throw new Error("Workspace not found");
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) throw new Error("Project not found");
  return { session, ws, project };
}

export async function createCommentAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  body: string,
): Promise<ActionResult> {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверный комментарий" };
  }
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  const created = await comments.create(
    ws.workspaceId,
    taskId,
    session.user.id,
    parsed.data,
  );
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "comment.create",
    payload: { commentId: created.id },
  });
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  return { ok: true };
}

export async function updateCommentAction(
  wsSlug: string,
  projectSlug: string,
  commentId: string,
  body: string,
): Promise<ActionResult> {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверный комментарий" };
  }
  const { session, ws } = await authorize(wsSlug, projectSlug);
  try {
    await comments.update(ws.workspaceId, commentId, session.user.id, parsed.data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось обновить" };
  }
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  return { ok: true };
}

export async function deleteCommentAction(
  wsSlug: string,
  projectSlug: string,
  commentId: string,
  taskId: string,
): Promise<ActionResult> {
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  try {
    await comments.softDelete(ws.workspaceId, commentId, session.user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось удалить" };
  }
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "comment.delete",
    payload: { commentId },
  });
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  return { ok: true };
}

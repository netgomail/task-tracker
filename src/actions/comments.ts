"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeProject, type ActionResult } from "@/actions/_shared";
import { sanitizeText } from "@/lib/sanitize";
import * as comments from "@/services/comments";
import * as activity from "@/services/activity";

export type { ActionResult };

const BodySchema = z
  .string()
  .trim()
  .min(1, "Введите комментарий")
  .max(5000, "Слишком длинный комментарий")
  .transform(sanitizeText);

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
  const auth = await authorizeProject(wsSlug, projectSlug);
  if (!auth.ok) return auth;
  const { session, ws, project } = auth;
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
  const auth = await authorizeProject(wsSlug, projectSlug);
  if (!auth.ok) return auth;
  const { session, ws } = auth;
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
  const auth = await authorizeProject(wsSlug, projectSlug);
  if (!auth.ok) return auth;
  const { session, ws, project } = auth;
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

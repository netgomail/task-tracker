"use server";

import { revalidatePath } from "next/cache";

import { authorizeWorkspace, type ActionResult } from "@/actions/_shared";
import * as taskLinks from "@/services/task-links";
import * as activity from "@/services/activity";
import { notifyBoard } from "@/lib/realtime";
import { TASK_LINK_TYPES, type TaskLinkType } from "@/domain/types";

export type { ActionResult };

/** Ревалидирует страницы и шлёт SSE-пинок для досок всех затронутых задач. */
async function refreshTasks(wsSlug: string, workspaceId: string, taskIds: string[]) {
  const refs = await Promise.all(
    [...new Set(taskIds)].map((id) => taskLinks.boardRefForTask(workspaceId, id)),
  );
  const seenBoards = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const ref of refs) {
    if (!ref) continue;
    if (!seenSlugs.has(ref.projectSlug)) {
      seenSlugs.add(ref.projectSlug);
      revalidatePath(`/w/${wsSlug}/p/${ref.projectSlug}`);
    }
    if (!seenBoards.has(ref.boardId)) {
      seenBoards.add(ref.boardId);
      notifyBoard(ref.boardId);
    }
  }
}

export async function createLinkAction(
  wsSlug: string,
  sourceTaskId: string,
  targetTaskId: string,
  type: string,
): Promise<ActionResult> {
  if (!(TASK_LINK_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: "Неизвестный тип связи" };
  }
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { session, ws } = auth;
  try {
    await taskLinks.create(ws.workspaceId, sourceTaskId, targetTaskId, type as TaskLinkType, session.user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: null,
    taskId: sourceTaskId,
    actorId: session.user.id,
    type: "link.create",
    payload: { targetTaskId, linkType: type },
  });
  await refreshTasks(wsSlug, ws.workspaceId, [sourceTaskId, targetTaskId]);
  return { ok: true };
}

export async function searchLinkableAction(
  wsSlug: string,
  query: string,
  excludeTaskId: string,
): Promise<{ ok: true; results: taskLinks.LinkableTask[] } | { ok: false; error: string }> {
  const auth = await authorizeWorkspace(wsSlug, "viewer");
  if (!auth.ok) return auth;
  const results = await taskLinks.searchLinkable(auth.ws.workspaceId, query, excludeTaskId);
  return { ok: true, results };
}

export async function deleteLinkAction(
  wsSlug: string,
  linkId: string,
  affectedTaskIds: string[],
): Promise<ActionResult> {
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { ws } = auth;
  await taskLinks.remove(ws.workspaceId, linkId);
  await refreshTasks(wsSlug, ws.workspaceId, affectedTaskIds);
  return { ok: true };
}

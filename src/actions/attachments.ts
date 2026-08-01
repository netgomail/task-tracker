"use server";

import { revalidatePath } from "next/cache";

import { authorizeWorkspace, type ActionResult } from "@/actions/_shared";
import { hasRole } from "@/lib/rbac";
import { notifyBoard } from "@/lib/realtime";
import * as activity from "@/services/activity";
import * as attachments from "@/services/attachments";
import { db } from "@/db";
import { tasks } from "@/db/schema/tasks";
import { boards, projects } from "@/db/schema/projects";
import { eq } from "drizzle-orm";

export async function deleteAttachmentAction(
  wsSlug: string,
  attachmentId: string,
): Promise<ActionResult> {
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { session, ws } = auth;

  const meta = await attachments.getMeta(ws.workspaceId, attachmentId);
  if (!meta) return { ok: false, error: "Файл не найден" };

  // Своё удалять может member; чужое — admin/owner.
  if (meta.uploadedBy.id !== session.user.id && !hasRole(ws.role, "admin")) {
    return { ok: false, error: "Удалять чужой файл может только админ" };
  }

  const result = await attachments.remove(ws.workspaceId, attachmentId);
  if (!result) return { ok: false, error: "Файл не найден" };

  // Берём проект/board для revalidate и notify.
  const [taskRow] = await db
    .select({
      projectId: tasks.projectId,
      projectSlug: projects.slug,
      boardId: boards.id,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(boards, eq(boards.projectId, projects.id))
    .where(eq(tasks.id, result.taskId))
    .limit(1);

  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: taskRow?.projectId ?? null,
    taskId: result.taskId,
    actorId: session.user.id,
    type: "attachment.remove",
    payload: { filename: meta.filename },
  });

  if (taskRow) {
    revalidatePath(`/w/${wsSlug}/p/${taskRow.projectSlug}`);
    notifyBoard(taskRow.boardId);
  }
  return { ok: true };
}

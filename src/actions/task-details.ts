"use server";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import * as tasks from "@/services/tasks";
import * as comments from "@/services/comments";
import * as activity from "@/services/activity";
import * as labels from "@/services/labels";
import * as attachmentsService from "@/services/attachments";
import * as customFieldsService from "@/services/custom-fields";
import { listMembers, type WorkspaceMember } from "@/services/membership";
import type { ActivityRow } from "@/services/activity";
import type { AttachmentRow } from "@/services/attachments";
import type { CommentRow } from "@/services/comments";
import type { LabelRow } from "@/services/labels";
import type { TaskRow } from "@/services/tasks";
import type { FieldDef } from "@/services/custom-fields";
import type { MembershipRole } from "@/domain/types";

export type TaskDetailsResult =
  | { ok: false; error: string }
  | {
      ok: true;
      task: SerializedTask;
      subtasks: SerializedTask[];
      comments: SerializedComment[];
      activity: SerializedActivity[];
      labels: LabelRow[];
      workspaceLabels: LabelRow[];
      members: WorkspaceMember[];
      assignee: WorkspaceMember | null;
      attachments: SerializedAttachment[];
      customFields: FieldDef[];
      customFieldValues: Record<string, string>;
      me: { id: string; name: string; role: MembershipRole };
    };

export type SerializedAttachment = Omit<AttachmentRow, "createdAt"> & {
  createdAt: string;
};

export type SerializedTask = Omit<TaskRow, "dueAt" | "completedAt" | "archivedAt" | "createdAt"> & {
  dueAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type SerializedComment = Omit<CommentRow, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export type SerializedActivity = Omit<ActivityRow, "createdAt"> & {
  createdAt: string;
};

function serializeTask(t: TaskRow): SerializedTask {
  return {
    ...t,
    dueAt: t.dueAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    archivedAt: t.archivedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function getTaskDetailsAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
): Promise<TaskDetailsResult> {
  try {
    const session = await requireUser();
    const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
    if (!ws) return { ok: false, error: "Workspace not found" };
    const project = await getProjectBySlug(ws.workspaceId, projectSlug);
    if (!project) return { ok: false, error: "Project not found" };

    const task = await tasks.getById(ws.workspaceId, taskId);
    if (!task) return { ok: false, error: "Задача не найдена" };

    const [
      subtaskRows,
      commentRows,
      activityRows,
      taskLabels,
      wsLabels,
      members,
      attachmentRows,
      customFieldDefs,
      customFieldValues,
    ] = await Promise.all([
      tasks.listSubtasks(ws.workspaceId, taskId),
      comments.listForTask(ws.workspaceId, taskId),
      activity.listForTask(ws.workspaceId, taskId),
      labels.listForTask(ws.workspaceId, taskId),
      labels.listForWorkspace(ws.workspaceId),
      listMembers(ws.workspaceId),
      attachmentsService.listForTask(ws.workspaceId, taskId),
      customFieldsService.listForProject(project.id),
      customFieldsService.getValuesForTask(ws.workspaceId, taskId),
    ]);

    const assignee = task.assigneeId
      ? members.find((m) => m.id === task.assigneeId) ?? null
      : null;

    return {
      ok: true,
      task: serializeTask(task),
      subtasks: subtaskRows.map(serializeTask),
      comments: commentRows.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      activity: activityRows.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      labels: taskLabels,
      workspaceLabels: wsLabels,
      members,
      assignee,
      attachments: attachmentRows.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      customFields: customFieldDefs,
      customFieldValues,
      me: { id: session.user.id, name: session.user.name, role: ws.role },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
}

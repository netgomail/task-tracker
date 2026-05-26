"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/rbac";
import {
  getBySlug as getWorkspaceBySlug,
  isMember,
} from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import * as tasks from "@/services/tasks";
import * as activity from "@/services/activity";
import { runAutomations } from "@/services/automations";
import { isLabelColor, type LabelColorSlug } from "@/lib/colors";
import { notifyBoard } from "@/lib/realtime";
import { sanitizeText } from "@/lib/sanitize";
import {
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskPriority,
  type TaskType,
} from "@/domain/types";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const TitleSchema = z
  .string()
  .trim()
  .min(1, "Введите название")
  .max(500, "Слишком длинное")
  .transform(sanitizeText);

async function authorize(wsSlug: string, projectSlug: string) {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) throw new Error("Workspace not found");
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) throw new Error("Project not found");
  return { session, ws, project };
}

function refreshBoard(wsSlug: string, projectSlug: string, boardId: string) {
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  notifyBoard(boardId);
}

export async function createTaskAction(
  wsSlug: string,
  projectSlug: string,
  columnId: string,
  formData: FormData,
): Promise<ActionResult> {
  const title = TitleSchema.safeParse(formData.get("title"));
  if (!title.success) {
    return { ok: false, error: title.error.issues[0]?.message ?? "Неверное название" };
  }
  const rawAssigneeId = ((formData.get("assigneeId") as string | null) ?? "").trim() || null;
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  if (rawAssigneeId && !(await isMember(ws.workspaceId, rawAssigneeId))) {
    return { ok: false, error: "Пользователь не состоит в workspace" };
  }
  const created = await tasks.create({
    workspaceId: ws.workspaceId,
    columnId,
    createdBy: session.user.id,
    title: title.data,
    assigneeId: rawAssigneeId,
  });
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId: created.id,
    actorId: session.user.id,
    type: "task.create",
    payload: { title: created.title },
  });
  await runAutomations({
    type: "task.created",
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId: created.id,
    actorId: session.user.id,
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

export async function renameTaskAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  title: string,
): Promise<ActionResult> {
  const parsed = TitleSchema.safeParse(title);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверное название" };
  }
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  await tasks.rename(ws.workspaceId, taskId, parsed.data);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "task.rename",
    payload: { title: parsed.data },
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

export async function setTaskColorAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  color: string,
): Promise<ActionResult> {
  if (!isLabelColor(color)) return { ok: false, error: "Неизвестный цвет" };
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  await tasks.setColor(ws.workspaceId, taskId, color as LabelColorSlug);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "task.color",
    payload: { color },
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

export async function setTaskPriorityAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  priority: string,
): Promise<ActionResult> {
  if (!(TASK_PRIORITIES as readonly string[]).includes(priority)) {
    return { ok: false, error: "Неизвестный приоритет" };
  }
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  await tasks.setPriority(ws.workspaceId, taskId, priority as TaskPriority);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "task.priority",
    payload: { priority },
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

export async function setTaskTypeAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  type: string,
): Promise<ActionResult> {
  if (!(TASK_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: "Неизвестный тип" };
  }
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  await tasks.setType(ws.workspaceId, taskId, type as TaskType);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "task.type",
    payload: { type },
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

export async function archiveTaskAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
): Promise<ActionResult> {
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  await tasks.archive(ws.workspaceId, taskId);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "task.archive",
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

export async function deleteTaskAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
): Promise<ActionResult> {
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  // Record activity BEFORE deletion since the FK cascades activity_events too.
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId: null,
    actorId: session.user.id,
    type: "task.delete",
    payload: { taskId },
  });
  await tasks.remove(ws.workspaceId, taskId);
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

export async function moveTaskAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  toColumnId: string,
  beforeKey: string | null,
  afterKey: string | null,
): Promise<ActionResult & { orderKey?: string }> {
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  const orderKey = await tasks.move(ws.workspaceId, taskId, toColumnId, beforeKey, afterKey);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "task.move",
    payload: { toColumnId, orderKey },
  });
  await runAutomations({
    type: "task.moved",
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    toColumnId,
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true, orderKey };
}

export async function setTaskDescriptionAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  description: string,
): Promise<ActionResult> {
  const trimmed = description.trim();
  const next = trimmed === "" ? null : sanitizeText(trimmed);
  if (next && next.length > 10_000) {
    return { ok: false, error: "Описание слишком длинное" };
  }
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  await tasks.setDescription(ws.workspaceId, taskId, next);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "task.description",
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

const DueSchema = z.union([z.literal(""), z.string().datetime({ offset: true }), z.iso.datetime()]);

export async function setTaskDueAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  dueIso: string,
): Promise<ActionResult> {
  const parsed = DueSchema.safeParse(dueIso);
  if (!parsed.success && dueIso !== "") {
    // Accept naive datetime-local like "2026-05-30T12:00".
    const d = new Date(dueIso);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Неверная дата" };
  }
  const next = dueIso === "" ? null : new Date(dueIso);
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  await tasks.setDueAt(ws.workspaceId, taskId, next);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "task.due",
    payload: { dueAt: next?.toISOString() ?? null },
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

export async function setTaskAssigneeAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  assigneeId: string,
): Promise<ActionResult> {
  const next = assigneeId.trim() === "" ? null : assigneeId.trim();
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  if (next && !(await isMember(ws.workspaceId, next))) {
    return { ok: false, error: "Пользователь не состоит в workspace" };
  }
  await tasks.setAssignee(ws.workspaceId, taskId, next);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "task.assignee",
    payload: { assigneeId: next },
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

export async function toggleTaskCompleteAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  completed: boolean,
): Promise<ActionResult> {
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  await tasks.setCompleted(ws.workspaceId, taskId, completed);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: completed ? "task.complete" : "task.reopen",
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

export async function createSubtaskAction(
  wsSlug: string,
  projectSlug: string,
  parentTaskId: string,
  title: string,
): Promise<ActionResult> {
  const parsed = TitleSchema.safeParse(title);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверное название" };
  }
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  const sub = await tasks.createSubtask(
    ws.workspaceId,
    parentTaskId,
    session.user.id,
    parsed.data,
  );
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId: parentTaskId,
    actorId: session.user.id,
    type: "subtask.create",
    payload: { subtaskId: sub.id, title: sub.title },
  });
  refreshBoard(wsSlug, projectSlug, project.boardId);
  return { ok: true };
}

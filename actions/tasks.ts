"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import * as tasks from "@/services/tasks";
import { isLabelColor, type LabelColorSlug } from "@/lib/colors";
import {
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskPriority,
  type TaskType,
} from "@/domain/types";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const TitleSchema = z.string().trim().min(1, "Введите название").max(200, "Слишком длинное");

async function authorize(wsSlug: string, projectSlug: string) {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) throw new Error("Workspace not found");
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) throw new Error("Project not found");
  return { session, ws, project };
}

function refreshBoard(wsSlug: string, projectSlug: string) {
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
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
  const { session, ws } = await authorize(wsSlug, projectSlug);
  await tasks.create({
    workspaceId: ws.workspaceId,
    columnId,
    createdBy: session.user.id,
    title: title.data,
  });
  refreshBoard(wsSlug, projectSlug);
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
  const { ws } = await authorize(wsSlug, projectSlug);
  await tasks.rename(ws.workspaceId, taskId, parsed.data);
  refreshBoard(wsSlug, projectSlug);
  return { ok: true };
}

export async function setTaskColorAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  color: string,
): Promise<ActionResult> {
  if (!isLabelColor(color)) return { ok: false, error: "Неизвестный цвет" };
  const { ws } = await authorize(wsSlug, projectSlug);
  await tasks.setColor(ws.workspaceId, taskId, color as LabelColorSlug);
  refreshBoard(wsSlug, projectSlug);
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
  const { ws } = await authorize(wsSlug, projectSlug);
  await tasks.setPriority(ws.workspaceId, taskId, priority as TaskPriority);
  refreshBoard(wsSlug, projectSlug);
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
  const { ws } = await authorize(wsSlug, projectSlug);
  await tasks.setType(ws.workspaceId, taskId, type as TaskType);
  refreshBoard(wsSlug, projectSlug);
  return { ok: true };
}

export async function archiveTaskAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
): Promise<ActionResult> {
  const { ws } = await authorize(wsSlug, projectSlug);
  await tasks.archive(ws.workspaceId, taskId);
  refreshBoard(wsSlug, projectSlug);
  return { ok: true };
}

export async function deleteTaskAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
): Promise<ActionResult> {
  const { ws } = await authorize(wsSlug, projectSlug);
  await tasks.remove(ws.workspaceId, taskId);
  refreshBoard(wsSlug, projectSlug);
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
  const { ws } = await authorize(wsSlug, projectSlug);
  const orderKey = await tasks.move(ws.workspaceId, taskId, toColumnId, beforeKey, afterKey);
  refreshBoard(wsSlug, projectSlug);
  return { ok: true, orderKey };
}

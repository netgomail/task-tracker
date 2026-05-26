"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/rbac";
import { notifyBoard } from "@/lib/realtime";
import { sanitizeText } from "@/lib/sanitize";
import * as activity from "@/services/activity";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import * as templates from "@/services/templates";
import { isLabelColor, type LabelColorSlug } from "@/lib/colors";
import {
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskPriority,
  type TaskType,
} from "@/domain/types";

const NameSchema = z
  .string()
  .trim()
  .min(1, "Введите название")
  .max(120, "Слишком длинное")
  .transform(sanitizeText);

const DescriptionSchema = z
  .string()
  .max(10_000, "Описание слишком длинное")
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : sanitizeText(v)));

export type ActionResult = { ok: true } | { ok: false; error: string };

async function authorize(wsSlug: string) {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) throw new Error("Workspace not found");
  return { session, ws };
}

export type TemplateFormInput = {
  name: string;
  description?: string;
  type: string;
  priority: string;
  color: string;
  labelIds: string[];
  subtasks: string[];
};

type ValidatedForm = {
  name: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  color: LabelColorSlug;
  labelIds: string[];
  subtasks: string[];
};

function validateForm(input: TemplateFormInput): { error: string } | ValidatedForm {
  const name = NameSchema.safeParse(input.name);
  if (!name.success) return { error: name.error.issues[0]?.message ?? "Неверное название" };
  const description = DescriptionSchema.safeParse(input.description ?? "");
  if (!description.success) return { error: description.error.issues[0]?.message ?? "Неверное описание" };
  if (!(TASK_TYPES as readonly string[]).includes(input.type)) {
    return { error: "Неизвестный тип" };
  }
  if (!(TASK_PRIORITIES as readonly string[]).includes(input.priority)) {
    return { error: "Неизвестный приоритет" };
  }
  if (!isLabelColor(input.color)) return { error: "Неизвестный цвет" };
  const subtasks = input.subtasks
    .map((s) => sanitizeText(s.trim()))
    .filter((s) => s.length > 0)
    .slice(0, 50);
  return {
    name: name.data,
    description: description.data,
    type: input.type as TaskType,
    priority: input.priority as TaskPriority,
    color: input.color as LabelColorSlug,
    labelIds: input.labelIds.filter((id) => typeof id === "string" && id.length > 0),
    subtasks,
  };
}

export async function createTemplateAction(
  wsSlug: string,
  input: TemplateFormInput,
): Promise<ActionResult> {
  const parsed = validateForm(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const { session, ws } = await authorize(wsSlug);
  await templates.create({
    workspaceId: ws.workspaceId,
    createdBy: session.user.id,
    name: parsed.name,
    description: parsed.description,
    type: parsed.type,
    priority: parsed.priority,
    color: parsed.color,
    labels: parsed.labelIds,
    subtasks: parsed.subtasks,
  });
  revalidatePath(`/w/${wsSlug}/settings/templates`);
  return { ok: true };
}

export async function updateTemplateAction(
  wsSlug: string,
  templateId: string,
  input: TemplateFormInput,
): Promise<ActionResult> {
  const parsed = validateForm(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const { ws } = await authorize(wsSlug);
  await templates.update(ws.workspaceId, templateId, {
    name: parsed.name,
    description: parsed.description,
    type: parsed.type,
    priority: parsed.priority,
    color: parsed.color,
    labels: parsed.labelIds,
    subtasks: parsed.subtasks,
  });
  revalidatePath(`/w/${wsSlug}/settings/templates`);
  return { ok: true };
}

export async function deleteTemplateAction(
  wsSlug: string,
  templateId: string,
): Promise<ActionResult> {
  const { ws } = await authorize(wsSlug);
  await templates.remove(ws.workspaceId, templateId);
  revalidatePath(`/w/${wsSlug}/settings/templates`);
  return { ok: true };
}

export async function createTaskFromTemplateAction(
  wsSlug: string,
  projectSlug: string,
  columnId: string,
  templateId: string,
): Promise<ActionResult> {
  const { session, ws } = await authorize(wsSlug);
  const result = await templates.createTaskFromTemplate({
    workspaceId: ws.workspaceId,
    createdBy: session.user.id,
    templateId,
    columnId,
  });
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: result.projectId,
    taskId: result.taskId,
    actorId: session.user.id,
    type: "task.create",
    payload: { fromTemplateId: templateId },
  });
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  notifyBoard(result.boardId);
  return { ok: true };
}

export async function saveTaskAsTemplateAction(
  wsSlug: string,
  taskId: string,
  name: string,
): Promise<ActionResult> {
  const parsedName = NameSchema.safeParse(name);
  if (!parsedName.success) {
    return { ok: false, error: parsedName.error.issues[0]?.message ?? "Неверное название" };
  }
  const { session, ws } = await authorize(wsSlug);
  await templates.createTemplateFromTask({
    workspaceId: ws.workspaceId,
    createdBy: session.user.id,
    taskId,
    templateName: parsedName.data,
  });
  revalidatePath(`/w/${wsSlug}/settings/templates`);
  return { ok: true };
}

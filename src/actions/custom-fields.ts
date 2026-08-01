"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeProject, type ActionResult } from "@/actions/_shared";
import { notifyBoard } from "@/lib/realtime";
import { sanitizeText } from "@/lib/sanitize";
import * as activity from "@/services/activity";
import * as customFields from "@/services/custom-fields";
import {
  type FieldType,
  type SelectOption,
  FIELD_TYPES,
} from "@/services/custom-fields";

export type { ActionResult };

const NameSchema = z
  .string()
  .trim()
  .min(1, "Введите название")
  .max(60, "Слишком длинное")
  .transform(sanitizeText);

function validateOptions(raw: unknown): SelectOption[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SelectOption[] = [];
  for (const item of raw) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).value !== "string" ||
      typeof (item as Record<string, unknown>).label !== "string"
    ) {
      continue;
    }
    const value = sanitizeText((item as SelectOption).value.trim()).slice(0, 40);
    const label = sanitizeText((item as SelectOption).label.trim()).slice(0, 60);
    if (!value || !label || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label });
    if (out.length >= 30) break;
  }
  return out;
}

export type CreateFieldInput = {
  name: string;
  type: string;
  options?: SelectOption[];
  required?: boolean;
};

export async function createFieldAction(
  wsSlug: string,
  projectSlug: string,
  input: CreateFieldInput,
): Promise<ActionResult> {
  const auth = await authorizeProject(wsSlug, projectSlug, "admin");
  if (!auth.ok) return auth;
  const { ws, project } = auth;
  const name = NameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: name.error.issues[0]?.message ?? "Неверное название" };
  if (!(FIELD_TYPES as readonly string[]).includes(input.type)) {
    return { ok: false, error: "Неизвестный тип поля" };
  }
  const type = input.type as FieldType;
  const options = type === "select" ? validateOptions(input.options ?? []) : [];
  if (type === "select" && options.length === 0) {
    return { ok: false, error: "Поле select требует минимум одну опцию" };
  }
  await customFields.createDef({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    name: name.data,
    type,
    options,
    required: input.required ?? false,
  });
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}/settings`);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  return { ok: true };
}

export type UpdateFieldInput = {
  name?: string;
  options?: SelectOption[];
  required?: boolean;
};

export async function updateFieldAction(
  wsSlug: string,
  projectSlug: string,
  fieldId: string,
  input: UpdateFieldInput,
): Promise<ActionResult> {
  const auth = await authorizeProject(wsSlug, projectSlug, "admin");
  if (!auth.ok) return auth;
  const { ws } = auth;
  const patch: customFields.UpdateDefInput = {};
  if (input.name !== undefined) {
    const name = NameSchema.safeParse(input.name);
    if (!name.success) return { ok: false, error: name.error.issues[0]?.message ?? "Неверное название" };
    patch.name = name.data;
  }
  if (input.options !== undefined) {
    patch.options = validateOptions(input.options);
  }
  if (input.required !== undefined) patch.required = input.required;
  await customFields.updateDef(ws.workspaceId, fieldId, patch);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}/settings`);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  return { ok: true };
}

export async function deleteFieldAction(
  wsSlug: string,
  projectSlug: string,
  fieldId: string,
): Promise<ActionResult> {
  const auth = await authorizeProject(wsSlug, projectSlug, "admin");
  if (!auth.ok) return auth;
  const { ws } = auth;
  await customFields.removeDef(ws.workspaceId, fieldId);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}/settings`);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  return { ok: true };
}

export async function moveFieldAction(
  wsSlug: string,
  projectSlug: string,
  fieldId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const auth = await authorizeProject(wsSlug, projectSlug, "admin");
  if (!auth.ok) return auth;
  const { ws } = auth;
  await customFields.moveDef(ws.workspaceId, fieldId, direction);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}/settings`);
  return { ok: true };
}

const SET_VALUE_ERRORS: Record<customFields.SetValueError, string> = {
  invalid_type: "Неверный тип поля",
  unknown_option: "Неизвестная опция",
  invalid_url: "Неверный URL (нужен http:// или https://)",
  invalid_number: "Неверное число",
  invalid_date: "Неверная дата",
};

export async function setFieldValueAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  fieldId: string,
  rawValue: string,
): Promise<ActionResult> {
  const auth = await authorizeProject(wsSlug, projectSlug);
  if (!auth.ok) return auth;
  const { session, ws, project } = auth;
  const result = await customFields.setValue(ws.workspaceId, taskId, fieldId, rawValue);
  if (!result.ok) return { ok: false, error: SET_VALUE_ERRORS[result.error] };
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "task.update",
    payload: { fieldId, value: rawValue || null },
  });
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  notifyBoard(project.boardId);
  return { ok: true };
}

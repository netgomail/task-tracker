"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeProject, type ActionResult } from "@/actions/_shared";
import * as columns from "@/services/columns";
import { DEFAULT_COLOR, isLabelColor, type LabelColorSlug } from "@/lib/colors";
import { notifyBoard } from "@/lib/realtime";

const NameSchema = z.string().trim().min(1, "Введите название").max(60, "Слишком длинное");

export async function createColumnAction(
  wsSlug: string,
  projectSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  const name = NameSchema.safeParse(formData.get("name"));
  if (!name.success) {
    return { ok: false, error: name.error.issues[0]?.message ?? "Неверное название" };
  }
  const colorRaw = formData.get("color");
  const color =
    typeof colorRaw === "string" && isLabelColor(colorRaw)
      ? (colorRaw as LabelColorSlug)
      : DEFAULT_COLOR;
  const auth = await authorizeProject(wsSlug, projectSlug);
  if (!auth.ok) return auth;
  const { ws, project } = auth;
  await columns.create({
    workspaceId: ws.workspaceId,
    boardId: project.boardId,
    name: name.data,
    color,
  });
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  notifyBoard(project.boardId);
  return { ok: true };
}

export async function renameColumnAction(
  wsSlug: string,
  projectSlug: string,
  columnId: string,
  name: string,
): Promise<ActionResult> {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверное название" };
  }
  const auth = await authorizeProject(wsSlug, projectSlug);
  if (!auth.ok) return auth;
  const { ws, project } = auth;
  await columns.rename(ws.workspaceId, columnId, parsed.data);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  notifyBoard(project.boardId);
  return { ok: true };
}

export async function setColumnColorAction(
  wsSlug: string,
  projectSlug: string,
  columnId: string,
  color: string,
): Promise<ActionResult> {
  if (!isLabelColor(color)) return { ok: false, error: "Неизвестный цвет" };
  const auth = await authorizeProject(wsSlug, projectSlug);
  if (!auth.ok) return auth;
  const { ws, project } = auth;
  await columns.setColor(ws.workspaceId, columnId, color);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  notifyBoard(project.boardId);
  return { ok: true };
}

export async function deleteColumnAction(
  wsSlug: string,
  projectSlug: string,
  columnId: string,
): Promise<ActionResult> {
  const auth = await authorizeProject(wsSlug, projectSlug);
  if (!auth.ok) return auth;
  const { ws, project } = auth;
  await columns.remove(ws.workspaceId, columnId);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  notifyBoard(project.boardId);
  return { ok: true };
}

export async function moveColumnAction(
  wsSlug: string,
  projectSlug: string,
  columnId: string,
  beforeKey: string | null,
  afterKey: string | null,
): Promise<ActionResult & { orderKey?: string }> {
  const auth = await authorizeProject(wsSlug, projectSlug);
  if (!auth.ok) return auth;
  const { ws, project } = auth;
  const orderKey = await columns.move(ws.workspaceId, columnId, beforeKey, afterKey);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  notifyBoard(project.boardId);
  return { ok: true, orderKey };
}

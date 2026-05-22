"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import * as columns from "@/services/columns";
import { isLabelColor, type LabelColorSlug } from "@/lib/colors";
import { notifyBoard } from "@/lib/realtime";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const NameSchema = z.string().trim().min(1, "Введите название").max(60, "Слишком длинное");

async function authorize(wsSlug: string, projectSlug: string) {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) throw new Error("Workspace not found");
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) throw new Error("Project not found");
  return { session, ws, project };
}

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
      : "slate";
  const { ws, project } = await authorize(wsSlug, projectSlug);
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
  const { ws, project } = await authorize(wsSlug, projectSlug);
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
  const { ws, project } = await authorize(wsSlug, projectSlug);
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
  const { ws, project } = await authorize(wsSlug, projectSlug);
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
  const { ws, project } = await authorize(wsSlug, projectSlug);
  const orderKey = await columns.move(ws.workspaceId, columnId, beforeKey, afterKey);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  notifyBoard(project.boardId);
  return { ok: true, orderKey };
}

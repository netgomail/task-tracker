"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import * as labels from "@/services/labels";
import * as activity from "@/services/activity";
import { runAutomations } from "@/services/automations";
import { isLabelColor, type LabelColorSlug } from "@/lib/colors";
import { notifyBoard } from "@/lib/realtime";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const NameSchema = z.string().trim().min(1, "Введите название").max(40, "Слишком длинное");

async function authorizeWorkspace(wsSlug: string) {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) throw new Error("Workspace not found");
  return { session, ws };
}

function refreshLabels(wsSlug: string) {
  revalidatePath(`/w/${wsSlug}/settings/labels`);
}

export async function createLabelAction(
  wsSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  const name = NameSchema.safeParse(formData.get("name"));
  if (!name.success) {
    return { ok: false, error: name.error.issues[0]?.message ?? "Неверное название" };
  }
  const colorRaw = formData.get("color");
  const color: LabelColorSlug =
    typeof colorRaw === "string" && isLabelColor(colorRaw) ? colorRaw : "slate";
  const iconRaw = formData.get("icon");
  const icon = typeof iconRaw === "string" && iconRaw ? iconRaw : null;
  const { ws } = await authorizeWorkspace(wsSlug);
  try {
    await labels.create(ws.workspaceId, name.data, color, icon);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    if (msg.includes("UNIQUE")) return { ok: false, error: "Метка с таким именем уже есть" };
    return { ok: false, error: msg };
  }
  refreshLabels(wsSlug);
  return { ok: true };
}

export async function renameLabelAction(
  wsSlug: string,
  labelId: string,
  name: string,
): Promise<ActionResult> {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверное название" };
  }
  const { ws } = await authorizeWorkspace(wsSlug);
  try {
    await labels.rename(ws.workspaceId, labelId, parsed.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    if (msg.includes("UNIQUE")) return { ok: false, error: "Метка с таким именем уже есть" };
    return { ok: false, error: msg };
  }
  refreshLabels(wsSlug);
  return { ok: true };
}

export async function setLabelColorAction(
  wsSlug: string,
  labelId: string,
  color: string,
): Promise<ActionResult> {
  if (!isLabelColor(color)) return { ok: false, error: "Неизвестный цвет" };
  const { ws } = await authorizeWorkspace(wsSlug);
  await labels.setColor(ws.workspaceId, labelId, color);
  refreshLabels(wsSlug);
  return { ok: true };
}

export async function setLabelIconAction(
  wsSlug: string,
  labelId: string,
  icon: string | null,
): Promise<ActionResult> {
  const { ws } = await authorizeWorkspace(wsSlug);
  await labels.setIcon(ws.workspaceId, labelId, icon);
  refreshLabels(wsSlug);
  return { ok: true };
}

export async function deleteLabelAction(
  wsSlug: string,
  labelId: string,
): Promise<ActionResult> {
  const { ws } = await authorizeWorkspace(wsSlug);
  await labels.remove(ws.workspaceId, labelId);
  refreshLabels(wsSlug);
  return { ok: true };
}

export async function attachLabelAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  labelId: string,
): Promise<ActionResult> {
  const { session, ws } = await authorizeWorkspace(wsSlug);
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) return { ok: false, error: "Project not found" };
  await labels.attach(ws.workspaceId, taskId, labelId);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "label.attach",
    payload: { labelId },
  });
  await runAutomations({
    type: "task.label_added",
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    labelId,
  });
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  notifyBoard(project.boardId);
  return { ok: true };
}

export async function detachLabelAction(
  wsSlug: string,
  projectSlug: string,
  taskId: string,
  labelId: string,
): Promise<ActionResult> {
  const { session, ws } = await authorizeWorkspace(wsSlug);
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) return { ok: false, error: "Project not found" };
  await labels.detach(ws.workspaceId, taskId, labelId);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    taskId,
    actorId: session.user.id,
    type: "label.detach",
    payload: { labelId },
  });
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  notifyBoard(project.boardId);
  return { ok: true };
}

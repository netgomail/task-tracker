"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeWorkspace, type ActionResult } from "@/actions/_shared";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import * as sets from "@/services/task-sets";

export type { ActionResult };

const NameSchema = z.string().trim().min(1, "Введите название").max(120, "Слишком длинное");

export async function instantiateSetAction(
  wsSlug: string,
  templateId: string,
  nameOverride?: string,
): Promise<{ ok: true; projectSlug: string } | { ok: false; error: string }> {
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { session, ws } = auth;
  const res = await sets.instantiate(ws.workspaceId, templateId, session.user.id, nameOverride);
  if (!res) return { ok: false, error: "Шаблон набора не найден" };
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true, projectSlug: res.projectSlug };
}

export async function saveProjectAsSetAction(
  wsSlug: string,
  projectSlug: string,
  name: string,
): Promise<ActionResult> {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверное название" };
  }
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { session, ws } = auth;
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) return { ok: false, error: "Project not found" };
  await sets.createFromProject(ws.workspaceId, project.id, parsed.data, session.user.id);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

export async function deleteSetAction(wsSlug: string, templateId: string): Promise<ActionResult> {
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { ws } = auth;
  await sets.remove(ws.workspaceId, templateId);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

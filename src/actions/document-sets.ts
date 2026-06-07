"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import * as sets from "@/services/document-sets";

export type ActionResult = { ok: true } | { ok: false; error: string };

const NameSchema = z.string().trim().min(1, "Введите название").max(120, "Слишком длинное");

async function authorizeWorkspace(wsSlug: string) {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) throw new Error("Workspace not found");
  return { session, ws };
}

export async function instantiateSetAction(
  wsSlug: string,
  templateId: string,
  nameOverride?: string,
): Promise<{ ok: true; projectSlug: string } | { ok: false; error: string }> {
  const { session, ws } = await authorizeWorkspace(wsSlug);
  const res = await sets.instantiate(ws.workspaceId, templateId, session.user.id, nameOverride);
  if (!res) return { ok: false, error: "Шаблон комплекта не найден" };
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
  const { session, ws } = await authorizeWorkspace(wsSlug);
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) return { ok: false, error: "Project not found" };
  await sets.createFromProject(ws.workspaceId, project.id, parsed.data, session.user.id);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

export async function deleteSetAction(wsSlug: string, templateId: string): Promise<ActionResult> {
  const { ws } = await authorizeWorkspace(wsSlug);
  await sets.remove(ws.workspaceId, templateId);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

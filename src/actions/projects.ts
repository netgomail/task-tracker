"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import * as projects from "@/services/projects";
import * as activity from "@/services/activity";

const NameSchema = z.string().trim().min(1, "Введите название").max(80, "Слишком длинное");

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function authorize(wsSlug: string) {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) throw new Error("Workspace not found");
  return { session, ws };
}

export async function createProjectAction(wsSlug: string, formData: FormData): Promise<ActionResult> {
  const name = NameSchema.safeParse(formData.get("name"));
  if (!name.success) {
    return { ok: false, error: name.error.issues[0]?.message ?? "Неверное название" };
  }
  const { session, ws } = await authorize(wsSlug);
  const project = await projects.create({
    workspaceId: ws.workspaceId,
    createdBy: session.user.id,
    name: name.data,
  });
  revalidatePath(`/w/${wsSlug}`);
  redirect(`/w/${wsSlug}/p/${project.slug}`);
}

export async function renameProjectAction(
  wsSlug: string,
  projectId: string,
  name: string,
): Promise<ActionResult> {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверное название" };
  }
  const { ws } = await authorize(wsSlug);
  await projects.rename(ws.workspaceId, projectId, parsed.data);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

export async function archiveProjectAction(wsSlug: string, projectId: string): Promise<ActionResult> {
  const { session, ws } = await authorize(wsSlug);
  await projects.archive(ws.workspaceId, projectId);
  await activity.record({
    workspaceId: ws.workspaceId,
    projectId,
    actorId: session.user.id,
    type: "project.archive",
  });
  revalidatePath(`/w/${wsSlug}`);
  revalidatePath(`/w/${wsSlug}/archive`);
  return { ok: true };
}

export async function deleteProjectAction(wsSlug: string, projectId: string): Promise<ActionResult> {
  const { ws } = await authorize(wsSlug);
  await projects.remove(ws.workspaceId, projectId);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

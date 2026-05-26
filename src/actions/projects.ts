"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/rbac";
import { isLabelColor, type LabelColorSlug } from "@/lib/colors";
import { sanitizeText } from "@/lib/sanitize";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import * as projects from "@/services/projects";
import * as activity from "@/services/activity";
import { listForProject as listCustomFieldsForProject } from "@/services/custom-fields";

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

export async function setProjectColorAction(
  wsSlug: string,
  projectId: string,
  color: string,
): Promise<ActionResult> {
  if (!isLabelColor(color)) return { ok: false, error: "Неизвестный цвет" };
  const { ws } = await authorize(wsSlug);
  await projects.setColor(ws.workspaceId, projectId, color as LabelColorSlug);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

export async function setProjectDescriptionAction(
  wsSlug: string,
  projectId: string,
  description: string,
): Promise<ActionResult> {
  const trimmed = description.trim();
  if (trimmed.length > 10_000) {
    return { ok: false, error: "Описание слишком длинное" };
  }
  const next = trimmed === "" ? null : sanitizeText(trimmed);
  const { ws } = await authorize(wsSlug);
  await projects.setDescription(ws.workspaceId, projectId, next);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

export type ProjectSettings = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  role: "owner" | "admin" | "member" | "viewer";
  customFields: Array<{
    id: string;
    name: string;
    type: string;
    options: Array<{ value: string; label: string }>;
    required: boolean;
  }>;
};

export type GetProjectSettingsResult =
  | { ok: true; data: ProjectSettings }
  | { ok: false; error: string };

export async function getProjectSettingsAction(
  wsSlug: string,
  projectSlug: string,
): Promise<GetProjectSettingsResult> {
  try {
    const { ws } = await authorize(wsSlug);
    const project = await getProjectBySlug(ws.workspaceId, projectSlug);
    if (!project) return { ok: false, error: "Проект не найден" };
    const full = await projects.getById(ws.workspaceId, project.id);
    if (!full) return { ok: false, error: "Проект не найден" };
    const fields = await listCustomFieldsForProject(project.id);
    return {
      ok: true,
      data: {
        id: full.id,
        slug: full.slug,
        name: full.name,
        description: full.description,
        color: full.color,
        role: ws.role,
        customFields: fields.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          options: f.options,
          required: f.required,
        })),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorizeWorkspace, type ActionResult } from "@/actions/_shared";
import { isLabelColor, type LabelColorSlug } from "@/lib/colors";
import { sanitizeText } from "@/lib/sanitize";
import { listMembers } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import * as projects from "@/services/projects";
import * as activity from "@/services/activity";
import * as automationsService from "@/services/automations";
import { listForBoard } from "@/services/columns";
import { listForWorkspace as listLabelsForWorkspace } from "@/services/labels";
import { listForProject as listCustomFieldsForProject } from "@/services/custom-fields";
import type { AutomationRow } from "@/domain/automations";

const NameSchema = z.string().trim().min(1, "Введите название").max(80, "Слишком длинное");

export async function createProjectAction(wsSlug: string, formData: FormData): Promise<ActionResult> {
  const name = NameSchema.safeParse(formData.get("name"));
  if (!name.success) {
    return { ok: false, error: name.error.issues[0]?.message ?? "Неверное название" };
  }
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { session, ws } = auth;
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
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { ws } = auth;
  await projects.rename(ws.workspaceId, projectId, parsed.data);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

export async function archiveProjectAction(wsSlug: string, projectId: string): Promise<ActionResult> {
  const auth = await authorizeWorkspace(wsSlug, "admin");
  if (!auth.ok) return auth;
  const { session, ws } = auth;
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
  const auth = await authorizeWorkspace(wsSlug, "admin");
  if (!auth.ok) return auth;
  const { ws } = auth;
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
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { ws } = auth;
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
  const auth = await authorizeWorkspace(wsSlug);
  if (!auth.ok) return auth;
  const { ws } = auth;
  await projects.setDescription(ws.workspaceId, projectId, next);
  revalidatePath(`/w/${wsSlug}`);
  return { ok: true };
}

export type SerializedAutomation = Omit<AutomationRow, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

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
  // Контекст для редактора автоматизаций (колонки / метки / участники / правила).
  automationsContext: {
    columns: Array<{ id: string; name: string; color: string }>;
    labels: Array<{ id: string; name: string; color: string }>;
    members: Array<{ id: string; name: string }>;
    rules: SerializedAutomation[];
  };
};

export type GetProjectSettingsResult =
  | { ok: true; data: ProjectSettings }
  | { ok: false; error: string };

export async function getProjectSettingsAction(
  wsSlug: string,
  projectSlug: string,
): Promise<GetProjectSettingsResult> {
  try {
    const auth = await authorizeWorkspace(wsSlug, "viewer");
    if (!auth.ok) return auth;
    const { ws } = auth;
    const project = await getProjectBySlug(ws.workspaceId, projectSlug);
    if (!project) return { ok: false, error: "Проект не найден" };
    const full = await projects.getById(ws.workspaceId, project.id);
    if (!full) return { ok: false, error: "Проект не найден" };
    const [fields, columns, labels, members, rules] = await Promise.all([
      listCustomFieldsForProject(project.id),
      listForBoard(project.boardId),
      listLabelsForWorkspace(ws.workspaceId),
      listMembers(ws.workspaceId),
      automationsService.listForProject(project.id),
    ]);
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
        automationsContext: {
          columns: columns.map((c) => ({ id: c.id, name: c.name, color: c.color })),
          labels: labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
          members: members.map((m) => ({ id: m.id, name: m.name })),
          rules: rules.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          })),
        },
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
}

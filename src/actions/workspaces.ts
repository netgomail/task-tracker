"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/rbac";
import { getBySlug } from "@/services/membership";
import * as membershipSvc from "@/services/membership";
import * as workspaces from "@/services/workspaces";
import { sanitizeText } from "@/lib/sanitize";
import { MEMBERSHIP_ROLES, type MembershipRole } from "@/domain/types";
import type { WorkspaceMember } from "@/services/membership";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(80, "Слишком длинное"),
});

const DeleteSchema = z.object({
  workspaceId: z.string().min(1),
});

const NameSchema = z
  .string()
  .trim()
  .min(1, "Введите название")
  .max(80, "Слишком длинное")
  .transform(sanitizeText);

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createWorkspaceAction(_: unknown, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = CreateSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  const ws = await workspaces.create(parsed.data.name);
  revalidatePath("/workspaces");
  redirect(`/w/${ws.slug}`);
}

export async function deleteWorkspaceAction(formData: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = DeleteSchema.safeParse({ workspaceId: formData.get("workspaceId") });
  if (!parsed.success) {
    return { ok: false, error: "Неверный workspace" };
  }
  try {
    await workspaces.remove(parsed.data.workspaceId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось удалить workspace";
    return { ok: false, error: message };
  }
  revalidatePath("/workspaces");
  return { ok: true };
}

export async function renameWorkspaceAction(
  wsSlug: string,
  name: string,
): Promise<ActionResult> {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверное название" };
  }
  const session = await requireUser();
  const ws = await getBySlug(session.user.id, wsSlug);
  if (!ws) return { ok: false, error: "Пространство не найдено" };
  if (ws.role !== "owner" && ws.role !== "admin") {
    return { ok: false, error: "Недостаточно прав" };
  }
  await workspaces.rename(ws.workspaceId, parsed.data);
  revalidatePath(`/w/${wsSlug}`);
  revalidatePath(`/w/${wsSlug}/settings`);
  return { ok: true };
}

export async function updateMemberRoleAction(
  wsSlug: string,
  memberId: string,
  role: string,
): Promise<ActionResult> {
  if (!(MEMBERSHIP_ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: "Неизвестная роль" };
  }
  const session = await requireUser();
  const ws = await getBySlug(session.user.id, wsSlug);
  if (!ws) return { ok: false, error: "Пространство не найдено" };
  if (ws.role !== "owner" && ws.role !== "admin") {
    return { ok: false, error: "Недостаточно прав" };
  }
  await membershipSvc.updateMemberRole(ws.workspaceId, memberId, role as MembershipRole);
  revalidatePath(`/w/${wsSlug}/settings`);
  return { ok: true };
}

export async function removeMemberAction(
  wsSlug: string,
  memberId: string,
): Promise<ActionResult> {
  const session = await requireUser();
  const ws = await getBySlug(session.user.id, wsSlug);
  if (!ws) return { ok: false, error: "Пространство не найдено" };
  if (ws.role !== "owner" && ws.role !== "admin") {
    return { ok: false, error: "Недостаточно прав" };
  }
  await membershipSvc.removeMember(ws.workspaceId, memberId);
  revalidatePath(`/w/${wsSlug}/settings`);
  return { ok: true };
}

export type AddMemberResult =
  | { ok: true; member: WorkspaceMember }
  | { ok: false; error: string };

export async function addMemberAction(
  wsSlug: string,
  userId: string,
  role: string,
): Promise<AddMemberResult> {
  if (!userId.trim()) {
    return { ok: false, error: "Выберите пользователя" };
  }
  if (!(MEMBERSHIP_ROLES as readonly string[]).includes(role) || role === "owner") {
    return { ok: false, error: "Неизвестная роль" };
  }
  const session = await requireUser();
  const ws = await getBySlug(session.user.id, wsSlug);
  if (!ws) return { ok: false, error: "Пространство не найдено" };
  if (ws.role !== "owner" && ws.role !== "admin") {
    return { ok: false, error: "Недостаточно прав" };
  }
  try {
    const newMember = await membershipSvc.addMember(ws.workspaceId, userId, role as MembershipRole);
    revalidatePath(`/w/${wsSlug}/settings`);
    return { ok: true, member: newMember };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось добавить участника";
    return { ok: false, error: message };
  }
}

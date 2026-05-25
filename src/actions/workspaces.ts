"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/rbac";
import * as workspaces from "@/services/workspaces";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(80, "Слишком длинное"),
});

const DeleteSchema = z.object({
  workspaceId: z.string().min(1),
});

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

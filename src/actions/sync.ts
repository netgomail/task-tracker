"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hasRole, requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import * as syncTokens from "@/services/sync-tokens";

export type CreateTokenResult =
  | { ok: true; secret: string }
  | { ok: false; error: string };

export type ActionResult = { ok: true } | { ok: false; error: string };

const NameSchema = z.string().trim().max(60, "Слишком длинное");

/** Название по умолчанию, если пользователь не задал своё. */
function defaultTokenName(): string {
  return `Obsidian ${new Date().toLocaleDateString("ru-RU")}`;
}

/** Управление токенами — операция администратора пространства. */
async function authorizeAdmin(wsSlug: string) {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) throw new Error("Workspace not found");
  if (!hasRole(ws.role, "admin")) throw new Error("Forbidden");
  return { session, ws };
}

export async function createSyncTokenAction(
  wsSlug: string,
  name: string,
): Promise<CreateTokenResult> {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверное название" };
  }
  const finalName = parsed.data || defaultTokenName();
  const { session, ws } = await authorizeAdmin(wsSlug);
  const { secret } = await syncTokens.create(ws.workspaceId, session.user.id, finalName);
  revalidatePath(`/w/${wsSlug}/settings/sync`);
  return { ok: true, secret };
}

export async function revokeSyncTokenAction(
  wsSlug: string,
  tokenId: string,
): Promise<ActionResult> {
  const { ws } = await authorizeAdmin(wsSlug);
  await syncTokens.revoke(ws.workspaceId, tokenId);
  revalidatePath(`/w/${wsSlug}/settings/sync`);
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeWorkspace, type ActionResult } from "@/actions/_shared";
import * as syncTokens from "@/services/sync-tokens";

export type CreateTokenResult =
  | { ok: true; secret: string }
  | { ok: false; error: string };

const NameSchema = z.string().trim().max(60, "Слишком длинное");

/** Название по умолчанию, если пользователь не задал своё. */
function defaultTokenName(): string {
  return `Obsidian ${new Date().toLocaleDateString("ru-RU")}`;
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
  const auth = await authorizeWorkspace(wsSlug, "admin");
  if (!auth.ok) return auth;
  const { session, ws } = auth;
  const { secret } = await syncTokens.create(ws.workspaceId, session.user.id, finalName);
  revalidatePath(`/w/${wsSlug}/settings/sync`);
  return { ok: true, secret };
}

export async function revokeSyncTokenAction(
  wsSlug: string,
  tokenId: string,
): Promise<ActionResult> {
  const auth = await authorizeWorkspace(wsSlug, "admin");
  if (!auth.ok) return auth;
  const { ws } = auth;
  await syncTokens.revoke(ws.workspaceId, tokenId);
  revalidatePath(`/w/${wsSlug}/settings/sync`);
  return { ok: true };
}

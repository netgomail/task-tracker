"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user as userTable, account } from "@/db/schema/auth";

export type ProfileData = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: string;
  hasPassword: boolean;
  providers: string[];
};

export async function getProfileAction(): Promise<ProfileData | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [userData] = await db
    .select({ emailVerified: userTable.emailVerified, createdAt: userTable.createdAt })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);

  const accounts = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, session.user.id));

  // dedupe: у пользователя может оказаться несколько строк account с одним
  // providerId (напр. дубль из старой базы) — в списке провайдер нужен один раз.
  const providers = [...new Set(accounts.map((a) => a.providerId))];

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
    emailVerified: userData?.emailVerified ?? false,
    createdAt: userData?.createdAt.toISOString() ?? new Date().toISOString(),
    hasPassword: providers.includes("credential"),
    providers,
  };
}

export async function updateProfileAction(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Имя не может быть пустым" };
  if (trimmed.length > 100) return { ok: false, error: "Имя слишком длинное (макс. 100 символов)" };

  try {
    await auth.api.updateUser({ headers: await headers(), body: { name: trimmed } });
    return { ok: true };
  } catch {
    return { ok: false, error: "Не удалось обновить профиль" };
  }
}

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (newPassword.length < 8) {
    return { ok: false, error: "Новый пароль — минимум 8 символов" };
  }

  try {
    await auth.api.changePassword({
      headers: await headers(),
      body: { currentPassword, newPassword, revokeOtherSessions: false },
    });
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("incorrect")) {
      return { ok: false, error: "Неверный текущий пароль" };
    }
    return { ok: false, error: "Не удалось изменить пароль" };
  }
}

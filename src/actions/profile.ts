"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user as userTable, account } from "@/db/schema/auth";
import { storage, AVATAR_STORAGE_NAMESPACE } from "@/lib/storage";

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

const AVATAR_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  // Без image/svg+xml намеренно — SVG может нести скрипт, а рендерится как <img>.
};
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

export async function updateAvatarAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; image?: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Не авторизован" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Файл не найден" };

  const ext = AVATAR_MIME_TO_EXT[file.type];
  if (!ext) return { ok: false, error: "Поддерживаются только PNG, JPEG, WEBP, GIF" };
  if (file.size > MAX_AVATAR_BYTES) return { ok: false, error: "Файл больше 3 МБ" };

  const [before] = await db
    .select({ image: userTable.image })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = await storage.put({
    workspaceId: AVATAR_STORAGE_NAMESPACE,
    taskId: session.user.id,
    ext,
    data: buffer,
  });
  const url = `/api/avatar/${storageKey}`;

  try {
    await auth.api.updateUser({ headers: await headers(), body: { image: url } });
  } catch {
    await storage.delete(storageKey).catch(() => {});
    return { ok: false, error: "Не удалось сохранить фото" };
  }

  // Best-effort: подчистить прошлый файл аватара, если он был нашим.
  if (before?.image?.startsWith(`/api/avatar/${AVATAR_STORAGE_NAMESPACE}/`)) {
    const prevKey = before.image.slice("/api/avatar/".length);
    storage.delete(prevKey).catch(() => {});
  }

  return { ok: true, image: url };
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

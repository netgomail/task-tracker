import { getSession } from "@/lib/rbac";
import { storage, AVATAR_STORAGE_NAMESPACE } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Раздаёт аватары пользователей. Ключ — сам storageKey (namespace/userId/uuid.ext),
 * закодированный прямо в URL: ничего не ищем в БД, просто читаем файл.
 * Требует любую валидную сессию (аватар не привязан к конкретному workspace).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { key } = await params;
  if (key[0] !== AVATAR_STORAGE_NAMESPACE) return new Response("Not found", { status: 404 });

  const storageKey = key.join("/");
  const ext = storageKey.split(".").pop() ?? "";
  const mime = EXT_TO_MIME[ext];
  if (!mime) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await storage.readAll(storageKey);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(data as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(data.length),
      // Имя файла уникально (uuid на каждую загрузку) — можно кэшировать вечно.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

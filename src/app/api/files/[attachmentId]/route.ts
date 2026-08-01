import { getSession } from "@/lib/rbac";
import { isInlineSafeMime } from "@/lib/limits";
import { storage } from "@/lib/storage";
import { db } from "@/db";
import { attachments } from "@/db/schema/attachments";
import { user } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { isMember } from "@/services/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeContentDisposition(filename: string, inline: boolean): string {
  // RFC 5987: filename* для unicode + ASCII-фолбэк через простой '_'.
  // Кавычки и бэкслеши тоже заменяем — иначе имя вида `a"; filename="b.html`
  // ломает разбор заголовка.
  const asciiFallback = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `${inline ? "inline" : "attachment"}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { attachmentId } = await params;
  const [row] = await db
    .select({
      id: attachments.id,
      workspaceId: attachments.workspaceId,
      filename: attachments.filename,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      storageKey: attachments.storageKey,
      uploaderId: user.id,
    })
    .from(attachments)
    .innerJoin(user, eq(user.id, attachments.uploadedBy))
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  if (!(await isMember(row.workspaceId, session.user.id))) {
    return new Response("Forbidden", { status: 403 });
  }

  let data: Buffer;
  try {
    data = await storage.readAll(row.storageKey);
  } catch {
    return new Response("File missing on disk", { status: 410 });
  }

  // Inline только растровые картинки и PDF (превью в карточке). Всё
  // остальное — download: text/*, svg и пр. браузер мог бы исполнить
  // на нашем origin. CSP sandbox ниже — вторая линия обороны: matcher
  // в proxy.ts исключает /api, глобальные заголовки сюда не доезжают.
  const inline = isInlineSafeMime(row.mimeType);

  const url = new URL(req.url);
  const forceDownload = url.searchParams.get("download") === "1";

  return new Response(data as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(row.sizeBytes),
      "Content-Disposition": encodeContentDisposition(row.filename, inline && !forceDownload),
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      // Приватный кэш: одна персона может перечитать, но прокси не кладут.
      "Cache-Control": "private, max-age=60",
    },
  });
}

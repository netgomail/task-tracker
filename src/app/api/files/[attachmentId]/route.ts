import { getSession } from "@/lib/rbac";
import { storage } from "@/lib/storage";
import { db } from "@/db";
import { attachments } from "@/db/schema/attachments";
import { user } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { isMember } from "@/services/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeContentDisposition(filename: string, inline: boolean): string {
  // RFC 5987: filename* для unicode + ASCII-фолбэк через простой '_'
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_");
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

  // Картинки/PDF/текст показываем inline (для превью в карточке).
  // Остальное — как download, чтобы не сюрпризить пользователя.
  const inline =
    row.mimeType.startsWith("image/") ||
    row.mimeType === "application/pdf" ||
    row.mimeType.startsWith("text/");

  const url = new URL(req.url);
  const forceDownload = url.searchParams.get("download") === "1";

  return new Response(data as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(row.sizeBytes),
      "Content-Disposition": encodeContentDisposition(row.filename, inline && !forceDownload),
      // Приватный кэш: одна персона может перечитать, но прокси не кладут.
      "Cache-Control": "private, max-age=60",
    },
  });
}

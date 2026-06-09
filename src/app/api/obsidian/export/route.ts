import { verifySyncRequest } from "@/lib/sync-auth";
import { exportDocuments, getWorkspaceName } from "@/services/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Все документы пространства (+ имя пространства) — для импорта заметок. */
export async function GET(req: Request): Promise<Response> {
  const ctx = await verifySyncRequest(req);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const [workspace, docs] = await Promise.all([
    getWorkspaceName(ctx.workspaceId),
    exportDocuments(ctx.workspaceId),
  ]);
  return Response.json({ workspace, docs });
}

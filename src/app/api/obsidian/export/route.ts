import { verifySyncRequest } from "@/lib/sync-auth";
import { exportDocuments } from "@/services/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Все документы пространства — для создания заметок из задач трекера. */
export async function GET(req: Request): Promise<Response> {
  const ctx = await verifySyncRequest(req);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const docs = await exportDocuments(ctx.workspaceId);
  return Response.json({ docs });
}

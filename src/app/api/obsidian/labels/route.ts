import { verifySyncRequest } from "@/lib/sync-auth";
import { listForWorkspace } from "@/services/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Метки пространства — для выбора свойства «Тип» в плагине. */
export async function GET(req: Request): Promise<Response> {
  const ctx = await verifySyncRequest(req);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const labels = await listForWorkspace(ctx.workspaceId);
  return Response.json({ labels: labels.map((l) => l.name) });
}

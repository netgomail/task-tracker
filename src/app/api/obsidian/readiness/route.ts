import { verifySyncRequest } from "@/lib/sync-auth";
import { vaultReadiness } from "@/services/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Готовность тем с разбивкой по документам — для генерации MOC в Obsidian. */
export async function GET(req: Request): Promise<Response> {
  const ctx = await verifySyncRequest(req);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const themes = await vaultReadiness(ctx.workspaceId);
  return Response.json({ themes });
}

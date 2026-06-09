import { verifySyncRequest } from "@/lib/sync-auth";
import { listForWorkspace } from "@/services/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Список тем (проектов) пространства — для выбора свойства «Тема» в плагине. */
export async function GET(req: Request): Promise<Response> {
  const ctx = await verifySyncRequest(req);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const themes = await listForWorkspace(ctx.workspaceId);
  return Response.json({ themes: themes.map((t) => ({ slug: t.slug, name: t.name })) });
}

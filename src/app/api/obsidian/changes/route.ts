import { verifySyncRequest } from "@/lib/sync-auth";
import { changedSince } from "@/services/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Задачи, изменившиеся после `?since=<ISO>` (статус → Obsidian). Плагин
 * сохраняет `now` из ответа и передаёт его в следующий запрос (курсор).
 * Без `since` — отдаём только курсор, без выборки (первичная инициализация).
 */
export async function GET(req: Request): Promise<Response> {
  const ctx = await verifySyncRequest(req);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const sinceRaw = new URL(req.url).searchParams.get("since");
  if (!sinceRaw) {
    return Response.json({ changes: [], now: now.toISOString() });
  }
  const since = new Date(sinceRaw);
  if (Number.isNaN(since.getTime())) {
    return Response.json({ error: "invalid_since" }, { status: 400 });
  }

  const changes = await changedSince(ctx.workspaceId, since);
  return Response.json({ changes, now: now.toISOString() });
}

import { getSession } from "@/lib/rbac";
import { getBySlug } from "@/services/membership";
import { subscribeWorkspace } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * SSE-канал «в пространстве что-то изменилось» для колокольчика уведомлений.
 * Переиспользует workspace-канал realtime.ts (тот же, что будит Obsidian-плагин),
 * поэтому пинок приходит на любую активность в пространстве — клиент просто
 * перечитывает свой список уведомлений, это дёшево.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const wsSlug = new URL(req.url).searchParams.get("ws");
  if (!wsSlug) return new Response("Missing ws param", { status: 400 });

  const ws = await getBySlug(session.user.id, wsSlug);
  if (!ws) return new Response("Forbidden", { status: 403 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      safeEnqueue("retry: 5000\n\n");
      safeEnqueue(`: ${"x".repeat(2048)}\n\n`);
      safeEnqueue(`: connected ws=${ws.workspaceId}\n\n`);

      const unsubscribe = subscribeWorkspace(ws.workspaceId, safeEnqueue);
      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_INTERVAL_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

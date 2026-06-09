import { verifySyncRequest } from "@/lib/sync-auth";
import { subscribeWorkspace } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * SSE-канал для Obsidian-плагина: пинок «в пространстве что-то изменилось» →
 * плагин дёргает /api/obsidian/changes?since=<курсор> и переписывает свойства
 * заметок. Аутентификация — только Bearer-токеном синхронизации.
 *
 * EventSource не умеет слать заголовки, поэтому токен принимаем и из ?token=.
 */
export async function GET(req: Request): Promise<Response> {
  let authedReq = req;
  const url = new URL(req.url);
  const tokenParam = url.searchParams.get("token");
  if (tokenParam && !req.headers.get("authorization")) {
    const headers = new Headers(req.headers);
    headers.set("authorization", `Bearer ${tokenParam}`);
    authedReq = new Request(req.url, { headers });
  }
  const ctx = await verifySyncRequest(authedReq);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

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
      safeEnqueue(`: connected ws=${ctx.workspaceId}\n\n`);

      const unsubscribe = subscribeWorkspace(ctx.workspaceId, safeEnqueue);
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

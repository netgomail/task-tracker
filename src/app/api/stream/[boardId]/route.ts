import { getSession } from "@/lib/rbac";
import { authorizeBoardAccess } from "@/services/boards";
import { subscribe } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 25_000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { boardId } = await params;
  const access = await authorizeBoardAccess(session.user.id, boardId);
  if (!access) {
    return new Response("Forbidden", { status: 403 });
  }

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

      // Приветствие + ретрай-таймаут для EventSource.
      safeEnqueue("retry: 5000\n\n");
      // 2 КБ комментария-паддинга, чтобы пробить буферы dev-сервера/прокси
      // (Next dev иногда не флашит маленькие чанки). Это no-op для клиента —
      // SSE-комментарии начинаются с двоеточия и игнорируются EventSource.
      safeEnqueue(`: ${"x".repeat(2048)}\n\n`);
      safeEnqueue(`: connected board=${boardId}\n\n`);

      const unsubscribe = subscribe(boardId, safeEnqueue);

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
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

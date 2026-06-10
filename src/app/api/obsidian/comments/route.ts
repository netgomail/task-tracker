import { z } from "zod";

import { verifySyncRequest } from "@/lib/sync-auth";
import { addComments } from "@/services/sync";
import { boardRefForTask } from "@/services/task-links";
import { notifyBoard } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  task_id: z.string().min(1),
  bodies: z.array(z.string()).default([]),
});

/** Добавляет комментарии из заметки, возвращает полный список комментариев. */
export async function POST(req: Request): Promise<Response> {
  const ctx = await verifySyncRequest(req);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const comments = await addComments(
      ctx.workspaceId,
      ctx.userId,
      parsed.data.task_id,
      parsed.data.bodies,
    );
    const ref = await boardRefForTask(ctx.workspaceId, parsed.data.task_id);
    if (ref) notifyBoard(ref.boardId);
    return Response.json({ comments });
  } catch {
    return Response.json({ error: "add_failed" }, { status: 422 });
  }
}

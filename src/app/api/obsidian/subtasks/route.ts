import { z } from "zod";

import { verifySyncRequest } from "@/lib/sync-auth";
import { reconcileSubtasks } from "@/services/sync";
import { boardRefForTask } from "@/services/task-links";
import { notifyBoard } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  task_id: z.string().min(1),
  items: z
    .array(
      z.object({
        id: z.string().nullish(),
        title: z.string().default(""),
        done: z.boolean().default(false),
      }),
    )
    .default([]),
});

/** Reconcile подзадач задачи по чеклисту из заметки. */
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
    const subtasks = await reconcileSubtasks(
      ctx.workspaceId,
      ctx.userId,
      parsed.data.task_id,
      parsed.data.items.map((i) => ({ id: i.id ?? null, title: i.title, done: i.done })),
    );
    const ref = await boardRefForTask(ctx.workspaceId, parsed.data.task_id);
    if (ref) notifyBoard(ref.boardId);
    return Response.json({ subtasks });
  } catch {
    return Response.json({ error: "reconcile_failed" }, { status: 422 });
  }
}

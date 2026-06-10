import { z } from "zod";

import { verifySyncRequest } from "@/lib/sync-auth";
import { upsertFromNote } from "@/services/sync";
import { boardRefForTask } from "@/services/task-links";
import { notifyBoard } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LinkSchema = z.object({
  tracker_id: z.string().nullish(),
  title: z.string().default(""),
  type: z.string().optional(),
});

const BodySchema = z.object({
  tracker_id: z.string().nullish(),
  path: z.string().min(1),
  title: z.string().min(1),
  theme: z.string().min(1),
  tags: z.array(z.string()).default([]),
  links: z.array(LinkSchema).default([]),
});

const ERROR_STATUS: Record<string, number> = {
  theme_required: 400,
  theme_not_found: 422,
  task_not_found: 404,
};

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
    return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;

  const result = await upsertFromNote(
    { workspaceId: ctx.workspaceId, userId: ctx.userId },
    {
      trackerId: b.tracker_id ?? null,
      path: b.path,
      title: b.title,
      theme: b.theme,
      tags: b.tags,
      links: b.links.map((l) => ({ trackerId: l.tracker_id ?? null, title: l.title, type: l.type })),
    },
  );

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: ERROR_STATUS[result.error] ?? 400 });
  }

  // Пинок живой доске — карточка появилась/обновилась.
  const ref = await boardRefForTask(ctx.workspaceId, result.trackerId);
  if (ref) notifyBoard(ref.boardId);

  return Response.json({
    tracker_id: result.trackerId,
    fields: result.fields,
    subtasks: result.subtasks,
    comments: result.comments,
  });
}

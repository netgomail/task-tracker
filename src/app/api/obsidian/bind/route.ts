import { z } from "zod";

import { verifySyncRequest } from "@/lib/sync-auth";
import { bindPaths } from "@/services/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  pairs: z
    .array(z.object({ tracker_id: z.string().min(1), path: z.string().min(1) }))
    .default([]),
});

/** Пакетная привязка заметок к задачам после импорта (проставляет obsidian_path). */
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

  const bound = await bindPaths(
    ctx.workspaceId,
    parsed.data.pairs.map((p) => ({ trackerId: p.tracker_id, path: p.path })),
  );
  return Response.json({ bound });
}

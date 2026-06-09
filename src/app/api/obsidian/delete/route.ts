import { z } from "zod";

import { verifySyncRequest } from "@/lib/sync-auth";
import { deleteByPath } from "@/services/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ path: z.string().min(1) });

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

  const { archived } = await deleteByPath(ctx.workspaceId, parsed.data.path);
  return Response.json({ archived });
}

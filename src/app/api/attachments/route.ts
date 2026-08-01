import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/rbac";
import { ATTACHMENT_LIMITS } from "@/lib/limits";
import { checkRateLimit } from "@/lib/rate-limit";
import * as activity from "@/services/activity";
import * as attachments from "@/services/attachments";
import { isMember } from "@/services/membership";
import { db } from "@/db";
import { tasks } from "@/db/schema/tasks";
import { boards, projects } from "@/db/schema/projects";
import { eq } from "drizzle-orm";
import { notifyBoard } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<attachments.UploadError, { status: number; text: string }> = {
  task_not_found: { status: 404, text: "Задача не найдена" },
  mime_not_allowed: { status: 415, text: "Этот тип файлов не поддерживается" },
  too_large: { status: 413, text: `Файл больше ${ATTACHMENT_LIMITS.maxFileBytes / 1024 / 1024} МБ` },
  task_quota_exceeded: {
    status: 413,
    text: `Превышен лимит на задачу (${ATTACHMENT_LIMITS.maxPerTaskBytes / 1024 / 1024} МБ)`,
  },
  too_many: {
    status: 413,
    text: `Можно прикрепить не больше ${ATTACHMENT_LIMITS.maxPerTaskCount} файлов`,
  },
};

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const rate = checkRateLimit(`upload:${session.user.id}`, 30, 60 * 1000);
  if (!rate.allowed) {
    return new Response("Слишком много загрузок, попробуйте позже", {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

  // Отказ ДО req.formData(): она буферизует весь запрос в память, и без
  // этой проверки несколько параллельных гигабайтных POST кладут процесс.
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > ATTACHMENT_LIMITS.maxFileBytes + 64 * 1024) {
    return new Response(ERROR_MESSAGES.too_large.text, { status: ERROR_MESSAGES.too_large.status });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response("Invalid form", { status: 400 });
  }
  const file = form.get("file");
  const taskId = (form.get("taskId") as string | null)?.trim();
  if (!taskId) return new Response("taskId is required", { status: 400 });
  if (!(file instanceof File)) return new Response("file is required", { status: 400 });

  // Достаём workspace/проект по задаче
  const [taskRow] = await db
    .select({
      workspaceId: tasks.workspaceId,
      projectId: tasks.projectId,
      projectSlug: projects.slug,
      boardId: boards.id,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(boards, eq(boards.projectId, projects.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!taskRow) return new Response("Task not found", { status: 404 });
  if (!(await isMember(taskRow.workspaceId, session.user.id))) {
    return new Response("Forbidden", { status: 403 });
  }

  // Точная проверка заявленного размера файла (Content-Length отсёк
  // только заведомо огромные запросы целиком).
  if (file.size > ATTACHMENT_LIMITS.maxFileBytes) {
    return new Response(ERROR_MESSAGES.too_large.text, { status: ERROR_MESSAGES.too_large.status });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await attachments.upload({
    workspaceId: taskRow.workspaceId,
    taskId,
    uploadedBy: session.user.id,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    data: buffer,
  });
  if (!result.ok) {
    const meta = ERROR_MESSAGES[result.error];
    return new Response(meta.text, { status: meta.status });
  }

  await activity.record({
    workspaceId: taskRow.workspaceId,
    projectId: taskRow.projectId,
    taskId,
    actorId: session.user.id,
    type: "attachment.add",
    payload: { filename: file.name, size: file.size },
  });

  revalidatePath(`/w/*/p/${taskRow.projectSlug}`);
  notifyBoard(taskRow.boardId);

  return Response.json({ id: result.id });
}

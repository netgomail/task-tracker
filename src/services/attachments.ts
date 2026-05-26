import "server-only";

import path from "node:path";

import { and, asc, count, eq, sum } from "drizzle-orm";

import { db } from "@/db";
import { attachments } from "@/db/schema/attachments";
import { user } from "@/db/schema/auth";
import { tasks } from "@/db/schema/tasks";
import { newId } from "@/lib/ids";
import { ATTACHMENT_LIMITS, isAllowedMime } from "@/lib/limits";
import { storage } from "@/lib/storage";

export type AttachmentRow = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { id: string; name: string };
};

export type AttachmentMeta = AttachmentRow & {
  storageKey: string;
  taskId: string;
  workspaceId: string;
};

async function assertTaskInWorkspace(taskId: string, workspaceId: string): Promise<void> {
  const [row] = await db
    .select({ workspaceId: tasks.workspaceId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) throw new Error("Task not in workspace");
}

export async function listForTask(
  workspaceId: string,
  taskId: string,
): Promise<AttachmentRow[]> {
  await assertTaskInWorkspace(taskId, workspaceId);
  const rows = await db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      createdAt: attachments.createdAt,
      uploaderId: user.id,
      uploaderName: user.name,
    })
    .from(attachments)
    .innerJoin(user, eq(user.id, attachments.uploadedBy))
    .where(and(eq(attachments.workspaceId, workspaceId), eq(attachments.taskId, taskId)))
    .orderBy(asc(attachments.createdAt));
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt,
    uploadedBy: { id: r.uploaderId, name: r.uploaderName },
  }));
}

export type UploadInput = {
  workspaceId: string;
  taskId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  data: Buffer;
};

export type UploadError =
  | "task_not_found"
  | "mime_not_allowed"
  | "too_large"
  | "task_quota_exceeded"
  | "too_many";

export async function upload(
  input: UploadInput,
): Promise<{ ok: true; id: string } | { ok: false; error: UploadError }> {
  // 1. Проверка задачи в workspace
  const [taskRow] = await db
    .select({ workspaceId: tasks.workspaceId })
    .from(tasks)
    .where(eq(tasks.id, input.taskId))
    .limit(1);
  if (!taskRow || taskRow.workspaceId !== input.workspaceId) {
    return { ok: false, error: "task_not_found" };
  }

  // 2. MIME-allowlist
  if (!isAllowedMime(input.mimeType)) return { ok: false, error: "mime_not_allowed" };

  // 3. Размер файла
  if (input.data.length > ATTACHMENT_LIMITS.maxFileBytes) {
    return { ok: false, error: "too_large" };
  }

  // 4. Лимит количества и суммы на задачу
  const [aggRow] = await db
    .select({ total: sum(attachments.sizeBytes), n: count() })
    .from(attachments)
    .where(and(eq(attachments.workspaceId, input.workspaceId), eq(attachments.taskId, input.taskId)));
  const currentTotal = Number(aggRow?.total ?? 0);
  const currentCount = Number(aggRow?.n ?? 0);
  if (currentCount >= ATTACHMENT_LIMITS.maxPerTaskCount) {
    return { ok: false, error: "too_many" };
  }
  if (currentTotal + input.data.length > ATTACHMENT_LIMITS.maxPerTaskBytes) {
    return { ok: false, error: "task_quota_exceeded" };
  }

  // 5. Пишем файл; ext восстановим из исходного имени.
  const ext = path.extname(input.filename).replace(".", "");
  const key = await storage.put({
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    ext,
    data: input.data,
  });

  // 6. Insert row. Если упадёт — file orphan, GC-скрипт уберёт.
  const id = newId();
  try {
    await db.insert(attachments).values({
      id,
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.data.length,
      storageKey: key,
      uploadedBy: input.uploadedBy,
    });
  } catch (e) {
    await storage.delete(key);
    throw e;
  }
  return { ok: true, id };
}

export async function getMeta(
  workspaceId: string,
  attachmentId: string,
): Promise<AttachmentMeta | null> {
  const [row] = await db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      createdAt: attachments.createdAt,
      storageKey: attachments.storageKey,
      taskId: attachments.taskId,
      workspaceId: attachments.workspaceId,
      uploaderId: user.id,
      uploaderName: user.name,
    })
    .from(attachments)
    .innerJoin(user, eq(user.id, attachments.uploadedBy))
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) return null;
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    storageKey: row.storageKey,
    taskId: row.taskId,
    workspaceId: row.workspaceId,
    uploadedBy: { id: row.uploaderId, name: row.uploaderName },
  };
}

export async function remove(
  workspaceId: string,
  attachmentId: string,
): Promise<{ taskId: string } | null> {
  const meta = await getMeta(workspaceId, attachmentId);
  if (!meta) return null;
  // Удаляем сначала row (внутри транзакции бы лучше, но storage асинхронный
  // вне БД): если physical delete упадёт — будет orphan-файл, не страшно.
  await db.delete(attachments).where(eq(attachments.id, attachmentId));
  await storage.delete(meta.storageKey).catch(() => undefined);
  return { taskId: meta.taskId };
}

/**
 * Вычитывает все вложения задачи и удаляет файлы. Использовать ПЕРЕД
 * `DELETE FROM tasks` — иначе FK cascade снесёт rows, а файлы останутся.
 */
export async function purgeForTask(workspaceId: string, taskId: string): Promise<void> {
  const rows = await db
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .where(and(eq(attachments.workspaceId, workspaceId), eq(attachments.taskId, taskId)));
  for (const r of rows) {
    await storage.delete(r.storageKey).catch(() => undefined);
  }
}

/**
 * Аналогично purgeForTask, но для всех задач проекта (при hard-delete
 * проекта). Один запрос за storage_keys, потом удаление по списку.
 */
export async function purgeForProject(workspaceId: string, projectId: string): Promise<void> {
  const rows = await db
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .innerJoin(tasks, eq(tasks.id, attachments.taskId))
    .where(and(eq(attachments.workspaceId, workspaceId), eq(tasks.projectId, projectId)));
  for (const r of rows) {
    await storage.delete(r.storageKey).catch(() => undefined);
  }
}

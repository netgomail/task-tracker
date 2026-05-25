import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { comments } from "@/db/schema/activity";
import { tasks } from "@/db/schema/tasks";
import { newId } from "@/lib/ids";

export const EDIT_WINDOW_MS = 5 * 60 * 1000;

export type CommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; image: string | null };
};

async function getTaskWorkspace(taskId: string): Promise<string | null> {
  const [row] = await db
    .select({ workspaceId: tasks.workspaceId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return row?.workspaceId ?? null;
}

export async function listForTask(workspaceId: string, taskId: string): Promise<CommentRow[]> {
  const ws = await getTaskWorkspace(taskId);
  if (ws !== workspaceId) return [];
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(comments)
    .innerJoin(user, eq(user.id, comments.authorId))
    .where(and(eq(comments.taskId, taskId), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt));
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    author: { id: r.authorId, name: r.authorName, image: r.authorImage ?? null },
  }));
}

export async function create(
  workspaceId: string,
  taskId: string,
  authorId: string,
  body: string,
): Promise<CommentRow> {
  const ws = await getTaskWorkspace(taskId);
  if (ws !== workspaceId) throw new Error("Task not in workspace");
  const id = newId();
  const now = new Date();
  await db.insert(comments).values({
    id,
    taskId,
    authorId,
    body,
    createdAt: now,
    updatedAt: now,
  });
  const [u] = await db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, authorId));
  return {
    id,
    body,
    createdAt: now,
    updatedAt: now,
    author: { id: u!.id, name: u!.name, image: u!.image ?? null },
  };
}

export async function update(
  workspaceId: string,
  commentId: string,
  authorId: string,
  body: string,
): Promise<void> {
  const [row] = await db
    .select({
      taskId: comments.taskId,
      authorId: comments.authorId,
      createdAt: comments.createdAt,
      deletedAt: comments.deletedAt,
    })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!row || row.deletedAt) throw new Error("Comment not found");
  if (row.authorId !== authorId) throw new Error("Not your comment");
  const ws = await getTaskWorkspace(row.taskId);
  if (ws !== workspaceId) throw new Error("Task not in workspace");
  if (Date.now() - row.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw new Error("Прошло слишком много времени — комментарий нельзя править");
  }
  await db
    .update(comments)
    .set({ body, updatedAt: new Date() })
    .where(eq(comments.id, commentId));
}

export async function softDelete(
  workspaceId: string,
  commentId: string,
  actorId: string,
): Promise<void> {
  const [row] = await db
    .select({ taskId: comments.taskId, authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!row) throw new Error("Comment not found");
  // Author can delete own; later — admins as well.
  if (row.authorId !== actorId) throw new Error("Not your comment");
  const ws = await getTaskWorkspace(row.taskId);
  if (ws !== workspaceId) throw new Error("Task not in workspace");
  await db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(eq(comments.id, commentId));
}

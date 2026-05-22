import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { activityEvents } from "@/db/schema/activity";
import { user } from "@/db/schema/auth";
import { newId } from "@/lib/ids";

export type ActivityType =
  | "task.create"
  | "task.rename"
  | "task.update"
  | "task.move"
  | "task.color"
  | "task.priority"
  | "task.type"
  | "task.due"
  | "task.description"
  | "task.complete"
  | "task.reopen"
  | "task.archive"
  | "task.unarchive"
  | "task.delete"
  | "subtask.create"
  | "subtask.delete"
  | "comment.create"
  | "comment.delete";

export type ActivityRow = {
  id: string;
  type: ActivityType;
  payload: Record<string, unknown> | null;
  createdAt: Date;
  actor: { id: string; name: string; image: string | null };
};

export type RecordInput = {
  workspaceId: string;
  projectId?: string | null;
  taskId?: string | null;
  actorId: string;
  type: ActivityType;
  payload?: Record<string, unknown> | null;
};

export async function record(input: RecordInput): Promise<void> {
  await db.insert(activityEvents).values({
    id: newId(),
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    actorId: input.actorId,
    type: input.type,
    payload: input.payload ? JSON.stringify(input.payload) : null,
  });
}

export async function listForTask(workspaceId: string, taskId: string): Promise<ActivityRow[]> {
  const rows = await db
    .select({
      id: activityEvents.id,
      type: activityEvents.type,
      payload: activityEvents.payload,
      createdAt: activityEvents.createdAt,
      actorId: user.id,
      actorName: user.name,
      actorImage: user.image,
    })
    .from(activityEvents)
    .innerJoin(user, eq(user.id, activityEvents.actorId))
    .where(and(eq(activityEvents.workspaceId, workspaceId), eq(activityEvents.taskId, taskId)))
    .orderBy(desc(activityEvents.createdAt));
  return rows.map((r) => ({
    id: r.id,
    type: r.type as ActivityType,
    payload: r.payload ? (JSON.parse(r.payload) as Record<string, unknown>) : null,
    createdAt: r.createdAt,
    actor: { id: r.actorId, name: r.actorName, image: r.actorImage ?? null },
  }));
}

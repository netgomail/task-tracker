import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { labels, taskLabels } from "@/db/schema/labels";
import { tasks } from "@/db/schema/tasks";
import { isLabelColor, type LabelColorSlug } from "@/lib/colors";
import { newId } from "@/lib/ids";

export type LabelRow = {
  id: string;
  name: string;
  color: LabelColorSlug;
};

function normalizeColor(value: string): LabelColorSlug {
  return isLabelColor(value) ? value : "slate";
}

export async function listForWorkspace(workspaceId: string): Promise<LabelRow[]> {
  const rows = await db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(labels)
    .where(eq(labels.workspaceId, workspaceId))
    .orderBy(asc(labels.name));
  return rows.map((r) => ({ ...r, color: normalizeColor(r.color) }));
}

export async function create(
  workspaceId: string,
  name: string,
  color: LabelColorSlug,
): Promise<LabelRow> {
  const id = newId();
  await db.insert(labels).values({
    id,
    workspaceId,
    name,
    color,
    createdAt: new Date(),
  });
  return { id, name, color };
}

async function assertLabelInWorkspace(workspaceId: string, labelId: string): Promise<void> {
  const [row] = await db
    .select({ workspaceId: labels.workspaceId })
    .from(labels)
    .where(eq(labels.id, labelId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) throw new Error("Label not in workspace");
}

export async function rename(workspaceId: string, labelId: string, name: string): Promise<void> {
  await assertLabelInWorkspace(workspaceId, labelId);
  await db.update(labels).set({ name }).where(eq(labels.id, labelId));
}

export async function setColor(
  workspaceId: string,
  labelId: string,
  color: LabelColorSlug,
): Promise<void> {
  if (!isLabelColor(color)) throw new Error("Unknown color");
  await assertLabelInWorkspace(workspaceId, labelId);
  await db.update(labels).set({ color }).where(eq(labels.id, labelId));
}

export async function remove(workspaceId: string, labelId: string): Promise<void> {
  await assertLabelInWorkspace(workspaceId, labelId);
  await db.delete(labels).where(eq(labels.id, labelId));
}

async function assertTaskInWorkspace(workspaceId: string, taskId: string): Promise<void> {
  const [row] = await db
    .select({ workspaceId: tasks.workspaceId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) throw new Error("Task not in workspace");
}

export async function attach(
  workspaceId: string,
  taskId: string,
  labelId: string,
): Promise<void> {
  await assertTaskInWorkspace(workspaceId, taskId);
  await assertLabelInWorkspace(workspaceId, labelId);
  await db
    .insert(taskLabels)
    .values({ taskId, labelId, createdAt: new Date() })
    .onConflictDoNothing();
}

export async function detach(
  workspaceId: string,
  taskId: string,
  labelId: string,
): Promise<void> {
  await assertTaskInWorkspace(workspaceId, taskId);
  await db
    .delete(taskLabels)
    .where(and(eq(taskLabels.taskId, taskId), eq(taskLabels.labelId, labelId)));
}

export async function listForTask(workspaceId: string, taskId: string): Promise<LabelRow[]> {
  await assertTaskInWorkspace(workspaceId, taskId);
  const rows = await db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.labelId))
    .where(eq(taskLabels.taskId, taskId))
    .orderBy(asc(labels.name));
  return rows.map((r) => ({ ...r, color: normalizeColor(r.color) }));
}

/**
 * Возвращает мапу taskId → метки. Используется доской, чтобы отрисовать чипы
 * без N+1 запросов.
 */
export async function listForTasks(
  workspaceId: string,
  taskIds: string[],
): Promise<Map<string, LabelRow[]>> {
  const out = new Map<string, LabelRow[]>();
  if (taskIds.length === 0) return out;
  const rows = await db
    .select({
      taskId: taskLabels.taskId,
      id: labels.id,
      name: labels.name,
      color: labels.color,
      workspaceId: labels.workspaceId,
    })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.labelId))
    .where(inArray(taskLabels.taskId, taskIds));
  for (const r of rows) {
    if (r.workspaceId !== workspaceId) continue;
    const list = out.get(r.taskId) ?? [];
    list.push({ id: r.id, name: r.name, color: normalizeColor(r.color) });
    out.set(r.taskId, list);
  }
  return out;
}

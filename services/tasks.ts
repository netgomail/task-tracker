import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { boards, columns, projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { keyBetween } from "@/domain/ordering";
import { newId } from "@/lib/ids";
import { isLabelColor, type LabelColorSlug } from "@/lib/colors";
import {
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskPriority,
  type TaskType,
} from "@/domain/types";

export type TaskRow = {
  id: string;
  columnId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  color: string;
  dueAt: Date | null;
  completedAt: Date | null;
  orderKey: string;
  assigneeId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
};

function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}
function isPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

export async function listForProject(projectId: string): Promise<TaskRow[]> {
  const rows = await db
    .select({
      id: tasks.id,
      columnId: tasks.columnId,
      parentId: tasks.parentId,
      title: tasks.title,
      description: tasks.description,
      type: tasks.type,
      priority: tasks.priority,
      color: tasks.color,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
      orderKey: tasks.orderKey,
      assigneeId: tasks.assigneeId,
      archivedAt: tasks.archivedAt,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.archivedAt), isNull(tasks.parentId)))
    .orderBy(asc(tasks.orderKey));
  return rows.map((r) => ({
    ...r,
    type: isTaskType(r.type) ? r.type : "task",
    priority: isPriority(r.priority) ? r.priority : "normal",
  }));
}

async function assertColumnInWorkspace(
  columnId: string,
  workspaceId: string,
): Promise<{ projectId: string }> {
  const [row] = await db
    .select({ projectId: projects.id, workspaceId: projects.workspaceId })
    .from(columns)
    .innerJoin(boards, eq(boards.id, columns.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .where(eq(columns.id, columnId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) throw new Error("Column not in workspace");
  return { projectId: row.projectId };
}

async function assertTaskInWorkspace(
  taskId: string,
  workspaceId: string,
): Promise<{ columnId: string; projectId: string }> {
  const [row] = await db
    .select({
      columnId: tasks.columnId,
      projectId: tasks.projectId,
      workspaceId: tasks.workspaceId,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) throw new Error("Task not in workspace");
  return { columnId: row.columnId, projectId: row.projectId };
}

export type CreateTaskInput = {
  workspaceId: string;
  columnId: string;
  createdBy: string;
  title: string;
  color?: LabelColorSlug;
  priority?: TaskPriority;
  type?: TaskType;
};

export async function create(input: CreateTaskInput): Promise<TaskRow> {
  const { projectId } = await assertColumnInWorkspace(input.columnId, input.workspaceId);
  const [last] = await db
    .select({ orderKey: tasks.orderKey })
    .from(tasks)
    .where(eq(tasks.columnId, input.columnId))
    .orderBy(desc(tasks.orderKey))
    .limit(1);
  const orderKey = keyBetween(last?.orderKey ?? null, null);
  const color = input.color ?? "slate";
  const priority = input.priority ?? "normal";
  const type = input.type ?? "task";
  const id = newId();
  const now = new Date();
  await db.insert(tasks).values({
    id,
    workspaceId: input.workspaceId,
    projectId,
    columnId: input.columnId,
    title: input.title,
    color,
    priority,
    type,
    orderKey,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return {
    id,
    columnId: input.columnId,
    parentId: null,
    title: input.title,
    description: null,
    type,
    priority,
    color,
    dueAt: null,
    completedAt: null,
    orderKey,
    assigneeId: null,
    archivedAt: null,
    createdAt: now,
  };
}

export async function rename(
  workspaceId: string,
  taskId: string,
  title: string,
): Promise<void> {
  await assertTaskInWorkspace(taskId, workspaceId);
  await db.update(tasks).set({ title, updatedAt: new Date() }).where(eq(tasks.id, taskId));
}

export async function setColor(
  workspaceId: string,
  taskId: string,
  color: LabelColorSlug,
): Promise<void> {
  if (!isLabelColor(color)) throw new Error("Unknown color");
  await assertTaskInWorkspace(taskId, workspaceId);
  await db.update(tasks).set({ color, updatedAt: new Date() }).where(eq(tasks.id, taskId));
}

export async function setPriority(
  workspaceId: string,
  taskId: string,
  priority: TaskPriority,
): Promise<void> {
  if (!isPriority(priority)) throw new Error("Unknown priority");
  await assertTaskInWorkspace(taskId, workspaceId);
  await db
    .update(tasks)
    .set({ priority, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

export async function setType(
  workspaceId: string,
  taskId: string,
  type: TaskType,
): Promise<void> {
  if (!isTaskType(type)) throw new Error("Unknown type");
  await assertTaskInWorkspace(taskId, workspaceId);
  await db.update(tasks).set({ type, updatedAt: new Date() }).where(eq(tasks.id, taskId));
}

export async function archive(workspaceId: string, taskId: string): Promise<void> {
  await assertTaskInWorkspace(taskId, workspaceId);
  await db
    .update(tasks)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

export async function remove(workspaceId: string, taskId: string): Promise<void> {
  await assertTaskInWorkspace(taskId, workspaceId);
  await db.delete(tasks).where(eq(tasks.id, taskId));
}

/**
 * Moves a task to a target column and position computed from neighbor keys.
 * Validates that both task and target column live in the same workspace.
 */
export async function move(
  workspaceId: string,
  taskId: string,
  toColumnId: string,
  beforeKey: string | null,
  afterKey: string | null,
): Promise<string> {
  await assertTaskInWorkspace(taskId, workspaceId);
  await assertColumnInWorkspace(toColumnId, workspaceId);
  const orderKey = keyBetween(beforeKey, afterKey);
  await db
    .update(tasks)
    .set({ columnId: toColumnId, orderKey, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  return orderKey;
}

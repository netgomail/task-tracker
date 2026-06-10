import "server-only";

import { and, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { taskLinks } from "@/db/schema/task-links";
import { tasks } from "@/db/schema/tasks";
import { boards, columns, projects } from "@/db/schema/projects";
import { newId } from "@/lib/ids";
import { TASK_LINK_TYPES, TASK_TYPES, type TaskLinkType, type TaskType } from "@/domain/types";

function isLinkType(value: string): value is TaskLinkType {
  return (TASK_LINK_TYPES as readonly string[]).includes(value);
}
function asTaskType(value: string): TaskType {
  return (TASK_TYPES as readonly string[]).includes(value) ? (value as TaskType) : "task";
}

/** Связанный документ — сосед задачи по комплекту, со стадией и темой. */
export type LinkedDocument = {
  linkId: string;
  direction: "outgoing" | "incoming";
  type: TaskLinkType;
  task: {
    id: string;
    title: string;
    type: TaskType;
    completedAt: Date | null;
    columnId: string;
    columnName: string;
    projectSlug: string;
  };
};

/**
 * Все связи задачи в обе стороны: outgoing (source = задача) и incoming
 * (target = задача). Для каждого соседа подтягиваем стадию (колонку) и тему.
 */
export async function listForTask(
  workspaceId: string,
  taskId: string,
): Promise<LinkedDocument[]> {
  const rows = await db
    .select({
      linkId: taskLinks.id,
      type: taskLinks.type,
      sourceId: taskLinks.sourceTaskId,
      targetId: taskLinks.targetTaskId,
      neighborId: tasks.id,
      title: tasks.title,
      docType: tasks.type,
      completedAt: tasks.completedAt,
      columnId: tasks.columnId,
      columnName: columns.name,
      projectSlug: projects.slug,
    })
    .from(taskLinks)
    // Сосед — это та сторона связи, которая не равна taskId.
    .innerJoin(
      tasks,
      or(
        and(eq(taskLinks.sourceTaskId, taskId), eq(tasks.id, taskLinks.targetTaskId)),
        and(eq(taskLinks.targetTaskId, taskId), eq(tasks.id, taskLinks.sourceTaskId)),
      ),
    )
    .innerJoin(columns, eq(columns.id, tasks.columnId))
    .innerJoin(boards, eq(boards.id, columns.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .where(
      and(
        eq(taskLinks.workspaceId, workspaceId),
        or(eq(taskLinks.sourceTaskId, taskId), eq(taskLinks.targetTaskId, taskId)),
      ),
    );

  return rows.map((r) => ({
    linkId: r.linkId,
    direction: r.sourceId === taskId ? ("outgoing" as const) : ("incoming" as const),
    type: isLinkType(r.type) ? r.type : "relates",
    task: {
      id: r.neighborId,
      title: r.title,
      type: asTaskType(r.docType),
      completedAt: r.completedAt,
      columnId: r.columnId,
      columnName: r.columnName,
      projectSlug: r.projectSlug,
    },
  }));
}

export type LinkAggregate = { done: number; total: number };

/**
 * Батч-агрегат связей для карточек доски: сколько связанных документов у задачи
 * и сколько из них завершено (completedAt). Считает связи в обе стороны.
 */
export async function linkAggregates(
  workspaceId: string,
  taskIds: string[],
): Promise<Map<string, LinkAggregate>> {
  const out = new Map<string, LinkAggregate>();
  if (taskIds.length === 0) return out;

  // Джойним оба конца связи отдельными алиасами, чтобы каждая связь была одной
  // строкой (иначе при обоих концах в наборе OR-джойн удваивает строки).
  const src = alias(tasks, "src");
  const tgt = alias(tasks, "tgt");
  const rows = await db
    .select({
      sourceId: taskLinks.sourceTaskId,
      targetId: taskLinks.targetTaskId,
      sourceCompleted: src.completedAt,
      targetCompleted: tgt.completedAt,
    })
    .from(taskLinks)
    .innerJoin(src, eq(src.id, taskLinks.sourceTaskId))
    .innerJoin(tgt, eq(tgt.id, taskLinks.targetTaskId))
    .where(
      and(
        eq(taskLinks.workspaceId, workspaceId),
        or(inArray(taskLinks.sourceTaskId, taskIds), inArray(taskLinks.targetTaskId, taskIds)),
      ),
    );

  const bump = (ownerId: string, neighborCompleted: boolean) => {
    const bucket = out.get(ownerId) ?? { done: 0, total: 0 };
    bucket.total += 1;
    if (neighborCompleted) bucket.done += 1;
    out.set(ownerId, bucket);
  };
  const wanted = new Set(taskIds);
  for (const r of rows) {
    // Каждая связь начисляется владельцу один раз; «готовность» — у соседа.
    if (wanted.has(r.sourceId)) bump(r.sourceId, r.targetCompleted != null);
    if (wanted.has(r.targetId)) bump(r.targetId, r.sourceCompleted != null);
  }
  return out;
}

export type LinkableTask = {
  id: string;
  title: string;
  type: TaskType;
  projectSlug: string;
};

/**
 * Кросс-проектный поиск документов для связывания: по подстроке названия,
 * только корневые задачи (не подзадачи), не архив, исключая текущую.
 */
export async function searchLinkable(
  workspaceId: string,
  query: string,
  excludeTaskId: string,
  limit = 8,
): Promise<LinkableTask[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      docType: tasks.type,
      projectSlug: projects.slug,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.parentId),
        isNull(tasks.archivedAt),
        ne(tasks.id, excludeTaskId),
        ilike(tasks.title, `%${q}%`),
      ),
    )
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: asTaskType(r.docType),
    projectSlug: r.projectSlug,
  }));
}

async function workspaceOf(taskId: string): Promise<string | null> {
  const [row] = await db
    .select({ workspaceId: tasks.workspaceId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return row?.workspaceId ?? null;
}

export async function create(
  workspaceId: string,
  sourceTaskId: string,
  targetTaskId: string,
  type: TaskLinkType,
  createdBy: string,
): Promise<void> {
  if (!isLinkType(type)) throw new Error("Unknown link type");
  if (sourceTaskId === targetTaskId) throw new Error("Нельзя связать документ с самим собой");
  const [src, tgt] = await Promise.all([workspaceOf(sourceTaskId), workspaceOf(targetTaskId)]);
  if (src !== workspaceId || tgt !== workspaceId) throw new Error("Task not in workspace");
  await db
    .insert(taskLinks)
    .values({
      id: newId(),
      workspaceId,
      sourceTaskId,
      targetTaskId,
      type,
      createdBy,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  // Обе стороны связи «изменились» — чтобы Obsidian-синхронизация подтянула.
  await touchTasks([sourceTaskId, targetTaskId]);
}

/** Помечает задачи как обновлённые (для обратного канала синхронизации). */
async function touchTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.update(tasks).set({ updatedAt: new Date() }).where(inArray(tasks.id, ids));
}

/** Доска и slug темы для задачи — чтобы ревалидировать/нотифицировать обе стороны связи. */
export async function boardRefForTask(
  workspaceId: string,
  taskId: string,
): Promise<{ boardId: string; projectSlug: string } | null> {
  const [row] = await db
    .select({ boardId: boards.id, projectSlug: projects.slug, workspaceId: tasks.workspaceId })
    .from(tasks)
    .innerJoin(columns, eq(columns.id, tasks.columnId))
    .innerJoin(boards, eq(boards.id, columns.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) return null;
  return { boardId: row.boardId, projectSlug: row.projectSlug };
}

export async function remove(workspaceId: string, linkId: string): Promise<void> {
  const [link] = await db
    .select({ source: taskLinks.sourceTaskId, target: taskLinks.targetTaskId })
    .from(taskLinks)
    .where(and(eq(taskLinks.id, linkId), eq(taskLinks.workspaceId, workspaceId)))
    .limit(1);
  await db
    .delete(taskLinks)
    .where(and(eq(taskLinks.id, linkId), eq(taskLinks.workspaceId, workspaceId)));
  if (link) await touchTasks([link.source, link.target]);
}

import "server-only";

import { and, asc, count, desc, eq, inArray, isNotNull, type SQL } from "drizzle-orm";

import { db, sqlite } from "@/db";
import { activityEvents } from "@/db/schema/activity";
import { user } from "@/db/schema/auth";
import { boards, columns, projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { keyBetween } from "@/domain/ordering";
import * as attachments from "@/services/attachments";
import { TASK_PRIORITIES, TASK_TYPES, type TaskPriority, type TaskType } from "@/domain/types";

export type ArchivedTaskRow = {
  id: string;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  color: string;
  archivedAt: Date;
  createdAt: Date;
  projectId: string;
  projectSlug: string;
  projectName: string;
  projectColor: string;
  archivedBy: { id: string; name: string } | null;
};

export type ListArchivedOpts = {
  projectId?: string;
  query?: string;
  page?: number;
  pageSize?: number;
};

function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}
function isPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

/**
 * FTS5-поиск по архивным задачам в рамках workspace. В отличие от
 * `services/search.ts:searchTaskIds`, поиск может ограничиваться одним проектом
 * или искать по всем — поэтому он живёт здесь.
 */
function searchArchivedIds(
  workspaceId: string,
  query: string,
  projectId: string | undefined,
): string[] | null {
  const fts = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(" ");
  if (!fts) return null;

  if (projectId) {
    const rows = sqlite
      .prepare<[string, string, string], { id: string }>(
        `SELECT t.id
         FROM tasks t
         JOIN tasks_fts f ON f.rowid = t.rowid
         WHERE tasks_fts MATCH ?
           AND t.workspace_id = ?
           AND t.project_id = ?
           AND t.archived_at IS NOT NULL`,
      )
      .all(fts, workspaceId, projectId);
    return rows.map((r) => r.id);
  }
  const rows = sqlite
    .prepare<[string, string], { id: string }>(
      `SELECT t.id
       FROM tasks t
       JOIN tasks_fts f ON f.rowid = t.rowid
       WHERE tasks_fts MATCH ?
         AND t.workspace_id = ?
         AND t.archived_at IS NOT NULL`,
    )
    .all(fts, workspaceId);
  return rows.map((r) => r.id);
}

export async function listArchivedTasks(
  workspaceId: string,
  opts: ListArchivedOpts = {},
): Promise<{ rows: ArchivedTaskRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));

  const conditions: SQL[] = [
    eq(tasks.workspaceId, workspaceId),
    isNotNull(tasks.archivedAt),
  ];
  if (opts.projectId) conditions.push(eq(tasks.projectId, opts.projectId));

  if (opts.query && opts.query.trim()) {
    const matching = searchArchivedIds(workspaceId, opts.query, opts.projectId);
    if (!matching || matching.length === 0) return { rows: [], total: 0 };
    conditions.push(inArray(tasks.id, matching));
  }

  const where = and(...conditions);

  const [totalRow] = await db.select({ value: count() }).from(tasks).where(where);

  const dataRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      type: tasks.type,
      priority: tasks.priority,
      color: tasks.color,
      archivedAt: tasks.archivedAt,
      createdAt: tasks.createdAt,
      projectId: tasks.projectId,
      projectSlug: projects.slug,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(where)
    .orderBy(desc(tasks.archivedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const archivedByMap = await loadArchivedBy(
    workspaceId,
    dataRows.map((r) => r.id),
  );

  return {
    rows: dataRows.map((r) => ({
      id: r.id,
      title: r.title,
      type: isTaskType(r.type) ? r.type : "task",
      priority: isPriority(r.priority) ? r.priority : "normal",
      color: r.color,
      archivedAt: r.archivedAt as Date,
      createdAt: r.createdAt,
      projectId: r.projectId,
      projectSlug: r.projectSlug,
      projectName: r.projectName,
      projectColor: r.projectColor,
      archivedBy: archivedByMap.get(r.id) ?? null,
    })),
    total: totalRow?.value ?? 0,
  };
}

/**
 * Для пачки taskId возвращает мапу `taskId → актор последнего task.archive`.
 * Источник — activity_events; событие пишется каждый раз при архивации.
 */
async function loadArchivedBy(
  workspaceId: string,
  taskIds: string[],
): Promise<Map<string, { id: string; name: string }>> {
  const out = new Map<string, { id: string; name: string }>();
  if (taskIds.length === 0) return out;
  const rows = await db
    .select({
      taskId: activityEvents.taskId,
      createdAt: activityEvents.createdAt,
      actorId: user.id,
      actorName: user.name,
    })
    .from(activityEvents)
    .innerJoin(user, eq(user.id, activityEvents.actorId))
    .where(
      and(
        eq(activityEvents.workspaceId, workspaceId),
        eq(activityEvents.type, "task.archive"),
        inArray(activityEvents.taskId, taskIds),
      ),
    )
    .orderBy(desc(activityEvents.createdAt));
  for (const r of rows) {
    if (!r.taskId || out.has(r.taskId)) continue;
    out.set(r.taskId, { id: r.actorId, name: r.actorName });
  }
  return out;
}

/**
 * Снимает archived_at у задачи. Если её исходной колонки больше нет
 * (например, удалена), переносит в первую колонку проекта; иначе оставляет
 * как есть. Возвращает projectSlug и boardId — пригодится для revalidatePath.
 */
export async function restoreTask(
  workspaceId: string,
  taskId: string,
): Promise<{ projectSlug: string; boardId: string } | null> {
  const [taskRow] = await db
    .select({
      id: tasks.id,
      columnId: tasks.columnId,
      projectId: tasks.projectId,
      workspaceId: tasks.workspaceId,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!taskRow || taskRow.workspaceId !== workspaceId) return null;

  const [proj] = await db
    .select({ slug: projects.slug, boardId: boards.id })
    .from(projects)
    .innerJoin(boards, eq(boards.projectId, projects.id))
    .where(eq(projects.id, taskRow.projectId))
    .limit(1);
  if (!proj) return null;

  const [originalCol] = await db
    .select({ id: columns.id })
    .from(columns)
    .where(eq(columns.id, taskRow.columnId))
    .limit(1);

  let nextColumnId = taskRow.columnId;
  let nextOrderKey: string | null = null;

  if (!originalCol) {
    const [first] = await db
      .select({ id: columns.id })
      .from(columns)
      .where(eq(columns.boardId, proj.boardId))
      .orderBy(asc(columns.orderKey))
      .limit(1);
    if (!first) throw new Error("В проекте нет колонок для восстановления задачи");
    nextColumnId = first.id;
    const [firstInCol] = await db
      .select({ orderKey: tasks.orderKey })
      .from(tasks)
      .where(eq(tasks.columnId, nextColumnId))
      .orderBy(asc(tasks.orderKey))
      .limit(1);
    nextOrderKey = keyBetween(null, firstInCol?.orderKey ?? null);
  }

  await db
    .update(tasks)
    .set({
      archivedAt: null,
      columnId: nextColumnId,
      ...(nextOrderKey ? { orderKey: nextOrderKey } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  return { projectSlug: proj.slug, boardId: proj.boardId };
}

/**
 * Hard-delete архивной задачи. Каскадно удалит подзадачи, комментарии,
 * task_labels, attachments (по FK onDelete cascade в схеме).
 */
export async function permanentlyDelete(
  workspaceId: string,
  taskId: string,
): Promise<{ projectSlug: string; boardId: string } | null> {
  const [taskRow] = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      workspaceId: tasks.workspaceId,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!taskRow || taskRow.workspaceId !== workspaceId) return null;

  const [proj] = await db
    .select({ slug: projects.slug, boardId: boards.id })
    .from(projects)
    .innerJoin(boards, eq(boards.projectId, projects.id))
    .where(eq(projects.id, taskRow.projectId))
    .limit(1);
  if (!proj) return null;

  // Удаляем физические файлы вложений ДО drop'а задачи, иначе FK cascade
  // снесёт rows attachments и storage_key потеряется.
  await attachments.purgeForTask(workspaceId, taskId);
  await db.delete(tasks).where(eq(tasks.id, taskId));
  return { projectSlug: proj.slug, boardId: proj.boardId };
}

export async function countArchived(workspaceId: string): Promise<number> {
  const [tasksRow] = await db
    .select({ value: count() })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), isNotNull(tasks.archivedAt)));
  const [projRow] = await db
    .select({ value: count() })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), isNotNull(projects.archivedAt)));
  return (tasksRow?.value ?? 0) + (projRow?.value ?? 0);
}

export type ArchivedProjectRow = {
  id: string;
  slug: string;
  name: string;
  color: string;
  archivedAt: Date;
  createdAt: Date;
  taskCount: number;
};

export async function listArchivedProjects(
  workspaceId: string,
): Promise<ArchivedProjectRow[]> {
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      color: projects.color,
      archivedAt: projects.archivedAt,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), isNotNull(projects.archivedAt)))
    .orderBy(desc(projects.archivedAt));

  if (rows.length === 0) return [];

  const taskCounts = await db
    .select({ projectId: tasks.projectId, value: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        inArray(
          tasks.projectId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .groupBy(tasks.projectId);
  const counts = new Map(taskCounts.map((c) => [c.projectId, c.value]));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    color: r.color,
    archivedAt: r.archivedAt as Date,
    createdAt: r.createdAt,
    taskCount: counts.get(r.id) ?? 0,
  }));
}

/**
 * Снимает archived_at у проекта. Не трогает задачи: они могли быть
 * заархивированы независимо.
 */
export async function restoreProject(
  workspaceId: string,
  projectId: string,
): Promise<{ slug: string } | null> {
  const [row] = await db
    .select({ id: projects.id, slug: projects.slug, workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) return null;

  await db
    .update(projects)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  return { slug: row.slug };
}

/**
 * Hard-delete проекта. По FK cascade удалит boards, columns, tasks,
 * task_labels, comments, attachments, activity_events.
 */
export async function permanentlyDeleteProject(
  workspaceId: string,
  projectId: string,
): Promise<{ slug: string } | null> {
  const [row] = await db
    .select({ id: projects.id, slug: projects.slug, workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) return null;

  await attachments.purgeForProject(workspaceId, projectId);
  await db.delete(projects).where(eq(projects.id, projectId));
  return { slug: row.slug };
}

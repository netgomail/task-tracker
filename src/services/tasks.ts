import "server-only";

import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { boards, columns, projects } from "@/db/schema/projects";
import { taskLabels } from "@/db/schema/labels";
import { tasks } from "@/db/schema/tasks";
import { comments } from "@/db/schema/activity";
import { attachments } from "@/db/schema/attachments";
import { keyBetween } from "@/domain/ordering";
import { newId } from "@/lib/ids";
import { dueDiffDays } from "@/lib/due-date";
import { DEFAULT_COLOR, isLabelColor, type LabelColorSlug } from "@/lib/colors";
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
  reviewAt: Date | null;
  completedAt: Date | null;
  orderKey: string;
  assigneeId: string | null;
  obsidianPath: string | null;
  archivedAt: Date | null;
  createdAt: Date;
};

function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}
function isPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

export type TaskFilter = {
  priority?: TaskPriority;
  labelId?: string;
  /** Список id из FTS5; если undefined — поиск не применялся, если [] — пусто. */
  matchingIds?: string[];
  /** `"unassigned"` — без исполнителя, `{ userId }` — закреплено за пользователем. */
  assignee?: "unassigned" | { userId: string };
};

export async function listForProject(
  projectId: string,
  filter?: TaskFilter,
): Promise<TaskRow[]> {
  const conditions: SQL[] = [
    eq(tasks.projectId, projectId),
    isNull(tasks.archivedAt),
    isNull(tasks.parentId),
  ];
  if (filter?.priority) {
    conditions.push(eq(tasks.priority, filter.priority));
  }
  if (filter?.matchingIds) {
    if (filter.matchingIds.length === 0) return [];
    conditions.push(inArray(tasks.id, filter.matchingIds));
  }
  if (filter?.assignee === "unassigned") {
    conditions.push(isNull(tasks.assigneeId));
  } else if (filter?.assignee && typeof filter.assignee === "object") {
    conditions.push(eq(tasks.assigneeId, filter.assignee.userId));
  }
  let query = db
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
      reviewAt: tasks.reviewAt,
      completedAt: tasks.completedAt,
      orderKey: tasks.orderKey,
      assigneeId: tasks.assigneeId,
      obsidianPath: tasks.obsidianPath,
      archivedAt: tasks.archivedAt,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .$dynamic();
  if (filter?.labelId) {
    query = query.innerJoin(
      taskLabels,
      and(eq(taskLabels.taskId, tasks.id), eq(taskLabels.labelId, filter.labelId)),
    );
  }
  const rows = await query.where(and(...conditions)).orderBy(asc(tasks.orderKey));
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

/** Колонка и автор задачи — используется, чтобы уведомить автора о смене статуса. */
export async function getOwnership(
  workspaceId: string,
  taskId: string,
): Promise<{ columnId: string; createdBy: string } | null> {
  const [row] = await db
    .select({ columnId: tasks.columnId, createdBy: tasks.createdBy, workspaceId: tasks.workspaceId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) return null;
  return { columnId: row.columnId, createdBy: row.createdBy };
}

export type DueSoonTask = {
  id: string;
  title: string;
  dueAt: Date;
  projectSlug: string;
  overdue: boolean;
};

/**
 * Задачи пользователя (по всем проектам пространства) с дедлайном сегодня,
 * завтра или уже просроченным — для бейджа-счётчика в шапке. dueDiffDays —
 * тот же день-based расчёт, что и на карточке/в таблице/в списке задач.
 */
export async function listDueSoonForUser(
  workspaceId: string,
  userId: string,
): Promise<DueSoonTask[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      projectSlug: projects.slug,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.assigneeId, userId),
        isNull(tasks.archivedAt),
        isNull(tasks.completedAt),
        isNotNull(tasks.dueAt),
      ),
    )
    .orderBy(asc(tasks.dueAt));

  return rows
    .filter((r): r is typeof r & { dueAt: Date } => r.dueAt != null)
    .map((r) => ({ ...r, diffDays: dueDiffDays(r.dueAt.toISOString()) }))
    .filter((r) => r.diffDays <= 1)
    .map(({ diffDays, ...r }) => ({ ...r, overdue: diffDays < 0 }));
}

export type CreateTaskInput = {
  workspaceId: string;
  columnId: string;
  createdBy: string;
  title: string;
  color?: LabelColorSlug;
  priority?: TaskPriority;
  type?: TaskType;
  assigneeId?: string | null;
};

export async function create(input: CreateTaskInput): Promise<TaskRow> {
  const { projectId } = await assertColumnInWorkspace(input.columnId, input.workspaceId);
  const [first] = await db
    .select({ orderKey: tasks.orderKey })
    .from(tasks)
    .where(eq(tasks.columnId, input.columnId))
    .orderBy(asc(tasks.orderKey))
    .limit(1);
  const orderKey = keyBetween(null, first?.orderKey ?? null);
  const color = input.color ?? DEFAULT_COLOR;
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
    assigneeId: input.assigneeId ?? null,
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
    reviewAt: null,
    completedAt: null,
    orderKey,
    assigneeId: input.assigneeId ?? null,
    obsidianPath: null,
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
  // Удалить физические файлы вложений до drop'а: cascade FK снесёт rows
  // attachments, без этого файлы остались бы orphan'ами на диске.
  const { purgeForTask } = await import("@/services/attachments");
  await purgeForTask(workspaceId, taskId);
  await db.delete(tasks).where(eq(tasks.id, taskId));
}

export async function getById(workspaceId: string, taskId: string): Promise<TaskRow | null> {
  const [row] = await db
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
      reviewAt: tasks.reviewAt,
      completedAt: tasks.completedAt,
      orderKey: tasks.orderKey,
      assigneeId: tasks.assigneeId,
      obsidianPath: tasks.obsidianPath,
      archivedAt: tasks.archivedAt,
      createdAt: tasks.createdAt,
      workspaceId: tasks.workspaceId,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) return null;
  return {
    ...row,
    type: isTaskType(row.type) ? row.type : "task",
    priority: isPriority(row.priority) ? row.priority : "normal",
  };
}

export async function listSubtasks(
  workspaceId: string,
  parentTaskId: string,
): Promise<TaskRow[]> {
  await assertTaskInWorkspace(parentTaskId, workspaceId);
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
      reviewAt: tasks.reviewAt,
      completedAt: tasks.completedAt,
      orderKey: tasks.orderKey,
      assigneeId: tasks.assigneeId,
      obsidianPath: tasks.obsidianPath,
      archivedAt: tasks.archivedAt,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .where(and(eq(tasks.parentId, parentTaskId), isNull(tasks.archivedAt)))
    .orderBy(asc(tasks.orderKey));
  return rows.map((r) => ({
    ...r,
    type: isTaskType(r.type) ? r.type : "task",
    priority: isPriority(r.priority) ? r.priority : "normal",
  }));
}

export async function createSubtask(
  workspaceId: string,
  parentTaskId: string,
  createdBy: string,
  title: string,
): Promise<TaskRow> {
  const parent = await getById(workspaceId, parentTaskId);
  if (!parent) throw new Error("Parent task not in workspace");
  const [last] = await db
    .select({ orderKey: tasks.orderKey })
    .from(tasks)
    .where(eq(tasks.parentId, parentTaskId))
    .orderBy(desc(tasks.orderKey))
    .limit(1);
  const orderKey = keyBetween(last?.orderKey ?? null, null);
  const id = newId();
  const now = new Date();
  await db.insert(tasks).values({
    id,
    workspaceId,
    projectId: (await assertTaskInWorkspace(parentTaskId, workspaceId)).projectId,
    columnId: parent.columnId,
    parentId: parentTaskId,
    title,
    color: parent.color,
    priority: "normal",
    type: "task",
    orderKey,
    createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return {
    id,
    columnId: parent.columnId,
    parentId: parentTaskId,
    title,
    description: null,
    type: "task",
    priority: "normal",
    color: parent.color,
    dueAt: null,
    reviewAt: null,
    completedAt: null,
    orderKey,
    assigneeId: null,
    obsidianPath: null,
    archivedAt: null,
    createdAt: now,
  };
}

export async function setDescription(
  workspaceId: string,
  taskId: string,
  description: string | null,
): Promise<void> {
  await assertTaskInWorkspace(taskId, workspaceId);
  await db
    .update(tasks)
    .set({ description, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

export async function setDueAt(
  workspaceId: string,
  taskId: string,
  dueAt: Date | null,
): Promise<void> {
  await assertTaskInWorkspace(taskId, workspaceId);
  await db
    .update(tasks)
    .set({ dueAt, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

export async function setReviewAt(
  workspaceId: string,
  taskId: string,
  reviewAt: Date | null,
): Promise<void> {
  await assertTaskInWorkspace(taskId, workspaceId);
  await db
    .update(tasks)
    .set({ reviewAt, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

export async function setCompleted(
  workspaceId: string,
  taskId: string,
  completed: boolean,
): Promise<void> {
  await assertTaskInWorkspace(taskId, workspaceId);
  await db
    .update(tasks)
    .set({ completedAt: completed ? new Date() : null, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

export async function setAssignee(
  workspaceId: string,
  taskId: string,
  assigneeId: string | null,
): Promise<void> {
  await assertTaskInWorkspace(taskId, workspaceId);
  await db
    .update(tasks)
    .set({ assigneeId, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

export type SubtaskSummary = {
  id: string;
  title: string;
  completedAt: Date | null;
  orderKey: string;
};

export type SubtaskAggregate = {
  done: number;
  total: number;
  items: SubtaskSummary[];
};

/**
 * Возвращает подзадачи для списка parent-id'ов одним запросом + строит мапу
 * с агрегатами done/total/items. Активити-фильтр: пропускаем archivedAt.
 */
export async function listSubtaskAggregates(
  workspaceId: string,
  parentIds: string[],
): Promise<Map<string, SubtaskAggregate>> {
  const out = new Map<string, SubtaskAggregate>();
  if (parentIds.length === 0) return out;
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      completedAt: tasks.completedAt,
      orderKey: tasks.orderKey,
      parentId: tasks.parentId,
      workspaceId: tasks.workspaceId,
      archivedAt: tasks.archivedAt,
    })
    .from(tasks)
    .where(inArray(tasks.parentId, parentIds))
    .orderBy(asc(tasks.orderKey));
  for (const r of rows) {
    if (r.workspaceId !== workspaceId || r.archivedAt || !r.parentId) continue;
    let bucket = out.get(r.parentId);
    if (!bucket) {
      bucket = { done: 0, total: 0, items: [] };
      out.set(r.parentId, bucket);
    }
    bucket.total += 1;
    if (r.completedAt) bucket.done += 1;
    bucket.items.push({
      id: r.id,
      title: r.title,
      completedAt: r.completedAt,
      orderKey: r.orderKey,
    });
  }
  return out;
}

export type TaskCounts = {
  commentsCount: number;
  attachmentsCount: number;
};

export async function listTaskCounts(
  workspaceId: string,
  taskIds: string[],
): Promise<Map<string, TaskCounts>> {
  if (taskIds.length === 0) return new Map();
  const [commentRows, attachmentRows] = await Promise.all([
    db
      .select({ taskId: comments.taskId, n: count() })
      .from(comments)
      .where(and(inArray(comments.taskId, taskIds), isNull(comments.deletedAt)))
      .groupBy(comments.taskId),
    db
      .select({ taskId: attachments.taskId, n: count() })
      .from(attachments)
      .where(and(inArray(attachments.taskId, taskIds), eq(attachments.workspaceId, workspaceId)))
      .groupBy(attachments.taskId),
  ]);
  const out = new Map<string, TaskCounts>();
  for (const r of commentRows) {
    const entry = out.get(r.taskId) ?? { commentsCount: 0, attachmentsCount: 0 };
    entry.commentsCount = r.n;
    out.set(r.taskId, entry);
  }
  for (const r of attachmentRows) {
    const entry = out.get(r.taskId) ?? { commentsCount: 0, attachmentsCount: 0 };
    entry.attachmentsCount = r.n;
    out.set(r.taskId, entry);
  }
  return out;
}

/**
 * Moves a task to a target column and position computed from neighbor keys.
 * Validates that both task and target column live in the same workspace.
 */
/**
 * Перемещает задачу в `toColumnId` между соседями `beforeTaskId`/`afterTaskId`
 * (id карточек, между которыми задачу бросили). Ключ порядка вычисляется здесь
 * из АКТУАЛЬНЫХ ключей соседей: клиентское состояние могло устареть (другая
 * вкладка, live-sync, синк Obsidian), а доверять присланным ключам нельзя —
 * при перевёрнутой паре keyBetween бросает исключение. Сосед, успевший уехать
 * из целевой колонки или в архив, игнорируется; если оба ориентира потеряны —
 * задача встаёт в конец колонки.
 */
export async function move(
  workspaceId: string,
  taskId: string,
  toColumnId: string,
  beforeTaskId: string | null,
  afterTaskId: string | null,
): Promise<string> {
  await assertTaskInWorkspace(taskId, workspaceId);
  await assertColumnInWorkspace(toColumnId, workspaceId);

  const neighborKey = async (id: string | null): Promise<string | null> => {
    if (!id || id === taskId) return null;
    const [row] = await db
      .select({ orderKey: tasks.orderKey })
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.columnId, toColumnId), isNull(tasks.archivedAt)))
      .limit(1);
    return row?.orderKey ?? null;
  };

  let before = await neighborKey(beforeTaskId);
  let after = await neighborKey(afterTaskId);
  // Соседи могли поменяться местами после броска — оставляем верхний ориентир.
  if (before !== null && after !== null && before >= after) after = null;
  if (before === null && after === null) {
    const [last] = await db
      .select({ orderKey: tasks.orderKey })
      .from(tasks)
      .where(
        and(
          eq(tasks.columnId, toColumnId),
          isNull(tasks.parentId),
          isNull(tasks.archivedAt),
          ne(tasks.id, taskId),
        ),
      )
      .orderBy(desc(tasks.orderKey))
      .limit(1);
    // Ориентиры потеряны или колонка пуста: ставим после последней задачи,
    // кроме случая «бросили в начало» — тогда сохраняем намерение.
    if (beforeTaskId === null && afterTaskId !== null) {
      after = await firstKeyInColumn(toColumnId, taskId);
    } else {
      before = last?.orderKey ?? null;
    }
  }
  const orderKey = keyBetween(before, after);
  await db
    .update(tasks)
    .set({ columnId: toColumnId, orderKey, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  return orderKey;
}

async function firstKeyInColumn(columnId: string, excludeTaskId: string): Promise<string | null> {
  const [first] = await db
    .select({ orderKey: tasks.orderKey })
    .from(tasks)
    .where(
      and(
        eq(tasks.columnId, columnId),
        isNull(tasks.parentId),
        isNull(tasks.archivedAt),
        ne(tasks.id, excludeTaskId),
      ),
    )
    .orderBy(asc(tasks.orderKey))
    .limit(1);
  return first?.orderKey ?? null;
}

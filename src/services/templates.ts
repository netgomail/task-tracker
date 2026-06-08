import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { labels, taskLabels } from "@/db/schema/labels";
import { boards, columns, projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { taskTemplates } from "@/db/schema/templates";
import { keyBetween, keysBetween } from "@/domain/ordering";
import { isLabelColor, type LabelColorSlug, DEFAULT_COLOR } from "@/lib/colors";
import { newId } from "@/lib/ids";
import { TASK_PRIORITIES, TASK_TYPES, type TaskPriority, type TaskType } from "@/domain/types";

export type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  color: LabelColorSlug;
  labels: string[];
  subtasks: string[];
  createdAt: Date;
  updatedAt: Date;
};

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}
function isPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

function rowToTemplate(r: typeof taskTemplates.$inferSelect): TemplateRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    type: isTaskType(r.type) ? r.type : "task",
    priority: isPriority(r.priority) ? r.priority : "normal",
    color: isLabelColor(r.color) ? r.color : DEFAULT_COLOR,
    labels: parseStringArray(r.labels),
    subtasks: parseStringArray(r.subtasks),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function listForWorkspace(workspaceId: string): Promise<TemplateRow[]> {
  const rows = await db
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.workspaceId, workspaceId))
    .orderBy(asc(taskTemplates.name));
  return rows.map(rowToTemplate);
}

export async function getById(
  workspaceId: string,
  templateId: string,
): Promise<TemplateRow | null> {
  const [row] = await db
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.id, templateId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) return null;
  return rowToTemplate(row);
}

export type CreateTemplateInput = {
  workspaceId: string;
  createdBy: string;
  name: string;
  description?: string | null;
  type?: TaskType;
  priority?: TaskPriority;
  color?: LabelColorSlug;
  labels?: string[];
  subtasks?: string[];
};

export async function create(input: CreateTemplateInput): Promise<TemplateRow> {
  const id = newId();
  const now = new Date();
  await db.insert(taskTemplates).values({
    id,
    workspaceId: input.workspaceId,
    createdBy: input.createdBy,
    name: input.name,
    description: input.description ?? null,
    type: input.type ?? "task",
    priority: input.priority ?? "normal",
    color: input.color ?? DEFAULT_COLOR,
    labels: input.labels ? JSON.stringify(input.labels) : null,
    subtasks: input.subtasks ? JSON.stringify(input.subtasks) : null,
    createdAt: now,
    updatedAt: now,
  });
  return {
    id,
    name: input.name,
    description: input.description ?? null,
    type: input.type ?? "task",
    priority: input.priority ?? "normal",
    color: input.color ?? DEFAULT_COLOR,
    labels: input.labels ?? [],
    subtasks: input.subtasks ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export type UpdateTemplateInput = {
  name?: string;
  description?: string | null;
  type?: TaskType;
  priority?: TaskPriority;
  color?: LabelColorSlug;
  labels?: string[];
  subtasks?: string[];
};

async function assertTemplateInWorkspace(workspaceId: string, templateId: string): Promise<void> {
  const [row] = await db
    .select({ workspaceId: taskTemplates.workspaceId })
    .from(taskTemplates)
    .where(eq(taskTemplates.id, templateId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) throw new Error("Template not in workspace");
}

export async function update(
  workspaceId: string,
  templateId: string,
  patch: UpdateTemplateInput,
): Promise<void> {
  await assertTemplateInWorkspace(workspaceId, templateId);
  const set: Partial<typeof taskTemplates.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.type !== undefined) set.type = patch.type;
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.color !== undefined) set.color = patch.color;
  if (patch.labels !== undefined) set.labels = patch.labels.length ? JSON.stringify(patch.labels) : null;
  if (patch.subtasks !== undefined) set.subtasks = patch.subtasks.length ? JSON.stringify(patch.subtasks) : null;
  await db.update(taskTemplates).set(set).where(eq(taskTemplates.id, templateId));
}

export async function remove(workspaceId: string, templateId: string): Promise<void> {
  await assertTemplateInWorkspace(workspaceId, templateId);
  await db.delete(taskTemplates).where(eq(taskTemplates.id, templateId));
}

export type CreateTaskFromTemplateInput = {
  workspaceId: string;
  createdBy: string;
  templateId: string;
  columnId: string;
};

/**
 * Создаёт задачу из шаблона: задача + подзадачи + метки в одной транзакции.
 * Метки, которые удалены из workspace, молча пропускаются.
 * Возвращает id новой задачи и id её проекта.
 */
export async function createTaskFromTemplate(
  input: CreateTaskFromTemplateInput,
): Promise<{ taskId: string; projectId: string; boardId: string; projectSlug: string }> {
  const tpl = await getById(input.workspaceId, input.templateId);
  if (!tpl) throw new Error("Template not found");

  // Достать проект по колонке + проверить workspace.
  const [colRow] = await db
    .select({
      projectId: projects.id,
      projectSlug: projects.slug,
      workspaceId: projects.workspaceId,
      boardId: boards.id,
    })
    .from(columns)
    .innerJoin(boards, eq(boards.id, columns.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .where(eq(columns.id, input.columnId))
    .limit(1);
  if (!colRow || colRow.workspaceId !== input.workspaceId) {
    throw new Error("Column not in workspace");
  }

  // Подобрать orderKey: вставляем в начало колонки.
  const [firstInCol] = await db
    .select({ orderKey: tasks.orderKey })
    .from(tasks)
    .where(eq(tasks.columnId, input.columnId))
    .orderBy(asc(tasks.orderKey))
    .limit(1);
  const orderKey = keyBetween(null, firstInCol?.orderKey ?? null);

  // Отфильтровать метки, которые ещё существуют в workspace.
  let validLabelIds: string[] = [];
  if (tpl.labels.length > 0) {
    const rows = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.workspaceId, input.workspaceId), inArray(labels.id, tpl.labels)));
    validLabelIds = rows.map((r) => r.id);
  }

  const taskId = newId();
  const now = new Date();

  // Транзакция: задача + подзадачи + label-связи.
  await db.transaction(async (tx) => {
    await tx.insert(tasks).values({
      id: taskId,
      workspaceId: input.workspaceId,
      projectId: colRow.projectId,
      columnId: input.columnId,
      title: tpl.name,
      description: tpl.description,
      type: tpl.type,
      priority: tpl.priority,
      color: tpl.color,
      orderKey,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    if (tpl.subtasks.length > 0) {
      const subKeys = keysBetween(null, null, tpl.subtasks.length);
      const subValues = tpl.subtasks.map((title, i) => ({
        id: newId(),
        workspaceId: input.workspaceId,
        projectId: colRow.projectId,
        columnId: input.columnId,
        parentId: taskId,
        title,
        type: "task" as const,
        priority: "normal" as const,
        color: tpl.color,
        orderKey: subKeys[i],
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      }));
      await tx.insert(tasks).values(subValues);
    }

    if (validLabelIds.length > 0) {
      await tx.insert(taskLabels).values(
        validLabelIds.map((labelId) => ({
          taskId,
          labelId,
          createdAt: now,
        })),
      );
    }
  });

  return {
    taskId,
    projectId: colRow.projectId,
    boardId: colRow.boardId,
    projectSlug: colRow.projectSlug,
  };
}

/**
 * Создаёт шаблон из существующей задачи: копирует поля + текущие подзадачи + метки.
 */
export async function createTemplateFromTask(input: {
  workspaceId: string;
  createdBy: string;
  taskId: string;
  templateName: string;
}): Promise<TemplateRow> {
  const [taskRow] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, input.taskId))
    .limit(1);
  if (!taskRow || taskRow.workspaceId !== input.workspaceId) {
    throw new Error("Task not in workspace");
  }

  const subRows = await db
    .select({ title: tasks.title, orderKey: tasks.orderKey })
    .from(tasks)
    .where(eq(tasks.parentId, input.taskId))
    .orderBy(asc(tasks.orderKey));

  const labelRows = await db
    .select({ labelId: taskLabels.labelId })
    .from(taskLabels)
    .where(eq(taskLabels.taskId, input.taskId));

  const type = isTaskType(taskRow.type) ? taskRow.type : "task";
  const priority = isPriority(taskRow.priority) ? taskRow.priority : "normal";
  const color = isLabelColor(taskRow.color) ? taskRow.color : DEFAULT_COLOR;

  return create({
    workspaceId: input.workspaceId,
    createdBy: input.createdBy,
    name: input.templateName,
    description: taskRow.description,
    type,
    priority,
    color,
    labels: labelRows.map((l) => l.labelId),
    subtasks: subRows.map((s) => s.title),
  });
}

// Заглушка под будущее: возможно понадобится «последние использованные».
export async function listRecent(workspaceId: string, limit = 5): Promise<TemplateRow[]> {
  const rows = await db
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.workspaceId, workspaceId))
    .orderBy(desc(taskTemplates.updatedAt))
    .limit(limit);
  return rows.map(rowToTemplate);
}

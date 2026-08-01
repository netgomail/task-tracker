import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { documentSetTemplates } from "@/db/schema/templates";
import { tasks } from "@/db/schema/tasks";
import { taskLinks } from "@/db/schema/task-links";
import { labels as labelsTable, taskLabels } from "@/db/schema/labels";
import { boards, columns } from "@/db/schema/projects";
import { listForTasks as listLabelsForTasks } from "@/services/labels";
import { keysBetween } from "@/domain/ordering";
import { newId } from "@/lib/ids";
import { create as createProject } from "@/services/projects";
import {
  TASK_LINK_TYPES,
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskLinkType,
  type TaskPriority,
  type TaskType,
} from "@/domain/types";
import { DEFAULT_COLOR, type LabelColorSlug } from "@/lib/colors";

/** Задача в шаблоне набора. `key` — локальный идентификатор для связей. */
export type SetItem = {
  key: string;
  title: string;
  type: TaskType;
  priority?: TaskPriority;
  color?: string;
  description?: string;
  /** Имена меток — навешиваются при разворачивании. */
  labels?: string[];
};

export type SetLink = {
  sourceKey: string;
  targetKey: string;
  type: TaskLinkType;
};

export type TaskSetSummary = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  itemCount: number;
};

function asType(v: string): TaskType {
  return (TASK_TYPES as readonly string[]).includes(v) ? (v as TaskType) : "task";
}
function asPriority(v: string | undefined): TaskPriority {
  return v && (TASK_PRIORITIES as readonly string[]).includes(v) ? (v as TaskPriority) : "normal";
}
function asLinkType(v: string): TaskLinkType {
  return (TASK_LINK_TYPES as readonly string[]).includes(v) ? (v as TaskLinkType) : "relates";
}

function parseItems(raw: string): SetItem[] {
  try {
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        key: String(x.key ?? ""),
        title: String(x.title ?? ""),
        type: asType(String(x.type ?? "task")),
        priority: asPriority(x.priority as string | undefined),
        color: typeof x.color === "string" ? x.color : undefined,
        description: typeof x.description === "string" ? x.description : undefined,
        labels: Array.isArray(x.labels) ? x.labels.map(String).filter(Boolean) : undefined,
      }))
      .filter((i) => i.key && i.title);
  } catch {
    return [];
  }
}

function parseLinks(raw: string | null): SetLink[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        sourceKey: String(x.sourceKey ?? ""),
        targetKey: String(x.targetKey ?? ""),
        type: asLinkType(String(x.type ?? "relates")),
      }))
      .filter((l) => l.sourceKey && l.targetKey && l.sourceKey !== l.targetKey);
  } catch {
    return [];
  }
}

export async function listForWorkspace(workspaceId: string): Promise<TaskSetSummary[]> {
  const rows = await db
    .select({
      id: documentSetTemplates.id,
      name: documentSetTemplates.name,
      description: documentSetTemplates.description,
      color: documentSetTemplates.color,
      items: documentSetTemplates.items,
    })
    .from(documentSetTemplates)
    .where(eq(documentSetTemplates.workspaceId, workspaceId))
    .orderBy(asc(documentSetTemplates.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    color: r.color,
    itemCount: parseItems(r.items).length,
  }));
}

export async function create(
  workspaceId: string,
  createdBy: string,
  input: { name: string; description?: string | null; color?: LabelColorSlug; items: SetItem[]; links: SetLink[] },
): Promise<string> {
  const id = newId();
  const now = new Date();
  await db.insert(documentSetTemplates).values({
    id,
    workspaceId,
    name: input.name,
    description: input.description ?? null,
    color: input.color ?? DEFAULT_COLOR,
    items: JSON.stringify(input.items),
    links: JSON.stringify(input.links),
    createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function remove(workspaceId: string, templateId: string): Promise<void> {
  await db
    .delete(documentSetTemplates)
    .where(
      and(
        eq(documentSetTemplates.id, templateId),
        eq(documentSetTemplates.workspaceId, workspaceId),
      ),
    );
}

/**
 * Снимок текущего проекта как шаблон набора: корневые задачи → items,
 * связи между ними → links. Позволяет разворачивать такой же проект заново.
 */
export async function createFromProject(
  workspaceId: string,
  projectId: string,
  name: string,
  createdBy: string,
): Promise<string> {
  const rootTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      type: tasks.type,
      priority: tasks.priority,
      color: tasks.color,
      description: tasks.description,
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentId), isNull(tasks.archivedAt)))
    .orderBy(asc(tasks.orderKey));

  const ids = rootTasks.map((t) => t.id);
  const labelMap = await listLabelsForTasks(workspaceId, ids);

  const idToKey = new Map<string, string>();
  const items: SetItem[] = rootTasks.map((t, i) => {
    const key = `k${i}`;
    idToKey.set(t.id, key);
    const names = (labelMap.get(t.id) ?? []).map((l) => l.name);
    return {
      key,
      title: t.title,
      type: asType(t.type),
      priority: asPriority(t.priority),
      color: t.color,
      description: t.description ?? undefined,
      labels: names.length ? names : undefined,
    };
  });

  let links: SetLink[] = [];
  if (ids.length > 0) {
    const linkRows = await db
      .select({
        sourceTaskId: taskLinks.sourceTaskId,
        targetTaskId: taskLinks.targetTaskId,
        type: taskLinks.type,
      })
      .from(taskLinks)
      .where(
        and(
          eq(taskLinks.workspaceId, workspaceId),
          inArray(taskLinks.sourceTaskId, ids),
          inArray(taskLinks.targetTaskId, ids),
        ),
      );
    links = linkRows
      .map((l) => ({
        sourceKey: idToKey.get(l.sourceTaskId) ?? "",
        targetKey: idToKey.get(l.targetTaskId) ?? "",
        type: asLinkType(l.type),
      }))
      .filter((l) => l.sourceKey && l.targetKey);
  }

  return create(workspaceId, createdBy, { name, items, links });
}

/**
 * Разворачивает набор в новый проект: создаёт проект (с дефолтными
 * колонками), кладёт все задачи в первую колонку и проставляет связи.
 */
export async function instantiate(
  workspaceId: string,
  templateId: string,
  createdBy: string,
  nameOverride?: string,
): Promise<{ projectSlug: string } | null> {
  const [tpl] = await db
    .select()
    .from(documentSetTemplates)
    .where(
      and(eq(documentSetTemplates.id, templateId), eq(documentSetTemplates.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!tpl) return null;

  const items = parseItems(tpl.items);
  const links = parseLinks(tpl.links);

  const project = await createProject({
    workspaceId,
    name: nameOverride?.trim() || tpl.name,
    color: (tpl.color as LabelColorSlug) ?? DEFAULT_COLOR,
    createdBy,
  });

  // Первая колонка («Не начато»).
  const [firstColumn] = await db
    .select({ id: columns.id })
    .from(columns)
    .innerJoin(boards, eq(boards.id, columns.boardId))
    .where(eq(boards.projectId, project.id))
    .orderBy(asc(columns.orderKey))
    .limit(1);
  if (!firstColumn) return { projectSlug: project.slug };

  const now = new Date();
  const orderKeys = keysBetween(null, null, Math.max(items.length, 1));
  const keyToId = new Map<string, string>();
  if (items.length > 0) {
    await db.insert(tasks).values(
      items.map((it, i) => {
        const id = newId();
        keyToId.set(it.key, id);
        return {
          id,
          workspaceId,
          projectId: project.id,
          columnId: firstColumn.id,
          title: it.title,
          description: it.description ?? null,
          type: it.type,
          priority: it.priority ?? "normal",
          color: it.color ?? DEFAULT_COLOR,
          orderKey: orderKeys[i],
          createdBy,
          createdAt: now,
          updatedAt: now,
        };
      }),
    );
  }

  // Метки задач: find-or-create по имени в воркспейсе, затем навесить.
  const allNames = [...new Set(items.flatMap((it) => it.labels ?? []))];
  if (allNames.length > 0) {
    const nameToLabelId = new Map<string, string>();
    for (const name of allNames) {
      const [existing] = await db
        .select({ id: labelsTable.id })
        .from(labelsTable)
        .where(and(eq(labelsTable.workspaceId, workspaceId), eq(labelsTable.name, name)))
        .limit(1);
      if (existing) {
        nameToLabelId.set(name, existing.id);
      } else {
        const id = newId();
        await db
          .insert(labelsTable)
          .values({ id, workspaceId, name, color: DEFAULT_COLOR, createdAt: now })
          .onConflictDoNothing();
        nameToLabelId.set(name, id);
      }
    }
    const labelRows = items.flatMap((it) => {
      const taskId = keyToId.get(it.key);
      if (!taskId || !it.labels?.length) return [];
      return it.labels
        .map((n) => nameToLabelId.get(n))
        .filter((id): id is string => !!id)
        .map((labelId) => ({ taskId, labelId, createdAt: now }));
    });
    if (labelRows.length > 0) {
      await db.insert(taskLabels).values(labelRows).onConflictDoNothing();
    }
  }

  const linkValues = links
    .map((l) => {
      const src = keyToId.get(l.sourceKey);
      const tgt = keyToId.get(l.targetKey);
      if (!src || !tgt) return null;
      return {
        id: newId(),
        workspaceId,
        sourceTaskId: src,
        targetTaskId: tgt,
        type: l.type,
        createdBy,
        createdAt: now,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  if (linkValues.length > 0) {
    await db.insert(taskLinks).values(linkValues).onConflictDoNothing();
  }

  return { projectSlug: project.slug };
}

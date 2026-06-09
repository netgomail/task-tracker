import "server-only";

import { and, asc, eq, gt, inArray, isNull, ne, type SQL } from "drizzle-orm";

import { db, type DB } from "@/db";
import { boards, columns, projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { labels, taskLabels } from "@/db/schema/labels";
import { taskLinks } from "@/db/schema/task-links";
import { organization, user } from "@/db/schema/auth";
import { keyBetween } from "@/domain/ordering";
import { newId } from "@/lib/ids";
import { env } from "@/lib/env";
import { TASK_LINK_TYPES, type TaskLinkType } from "@/domain/types";

/** Колонка-стадия «не начато» (старт жизненного цикла документа). */
const NOT_STARTED_COLUMN = "Не начато";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

function isLinkType(value: string | undefined): value is TaskLinkType {
  return value != null && (TASK_LINK_TYPES as readonly string[]).includes(value);
}

function dateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Сериализация задачи во frontmatter Obsidian (поля, которыми владеет трекер).
// ─────────────────────────────────────────────────────────────────────────────

export type NoteStatus = "not_started" | "in_progress" | "done";

/** Трекер-владеемые свойства заметки (read-only со стороны Obsidian). */
export type NoteFields = {
  tracker_id: string;
  status: NoteStatus;
  stage: string;
  priority: string;
  due: string | null;
  review: string | null;
  completed: string | null;
  assignee: string | null;
  tracker_url: string;
  tracker_updated: string;
};

function deriveStatus(completedAt: Date | null, columnName: string): NoteStatus {
  if (completedAt) return "done";
  if (columnName === NOT_STARTED_COLUMN) return "not_started";
  return "in_progress";
}

function buildFields(row: {
  id: string;
  priority: string;
  dueAt: Date | null;
  reviewAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
  columnName: string;
  assigneeName: string | null;
  wsSlug: string;
  projectSlug: string;
}): NoteFields {
  return {
    tracker_id: row.id,
    status: deriveStatus(row.completedAt, row.columnName),
    stage: row.columnName,
    priority: row.priority,
    due: dateOnly(row.dueAt),
    review: dateOnly(row.reviewAt),
    completed: dateOnly(row.completedAt),
    assignee: row.assigneeName,
    tracker_url: `${env.BETTER_AUTH_URL}/w/${row.wsSlug}/p/${row.projectSlug}?task=${row.id}`,
    tracker_updated: row.updatedAt.toISOString(),
  };
}

/** Сериализует одну задачу. null — задача не в этом пространстве. */
export async function serializeForNote(
  workspaceId: string,
  taskId: string,
): Promise<NoteFields | null> {
  const [row] = await selectNoteRows(db, and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)));
  return row ? buildFields(row) : null;
}

// Общий select для сериализации (используется serialize + changedSince).
function selectNoteRows(runner: DB | Tx, where: SQL | undefined) {
  return runner
    .select({
      id: tasks.id,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      reviewAt: tasks.reviewAt,
      completedAt: tasks.completedAt,
      updatedAt: tasks.updatedAt,
      archivedAt: tasks.archivedAt,
      obsidianPath: tasks.obsidianPath,
      columnName: columns.name,
      assigneeName: user.name,
      wsSlug: organization.slug,
      projectSlug: projects.slug,
    })
    .from(tasks)
    .innerJoin(columns, eq(columns.id, tasks.columnId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(organization, eq(organization.id, tasks.workspaceId))
    .leftJoin(user, eq(user.id, tasks.assigneeId))
    .where(where);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconcile: заметка Obsidian → задача трекера.
// ─────────────────────────────────────────────────────────────────────────────

export type NoteLink = { trackerId?: string | null; title: string; type?: string };

export type UpsertInput = {
  /** tracker_id из frontmatter; пусто → создаём задачу. */
  trackerId?: string | null;
  /** Vault-относительный путь заметки. */
  path: string;
  /** Заголовок (= имя файла без .md). Obsidian-owned. */
  title: string;
  /** slug темы (projects.slug). Обязателен. */
  theme: string;
  /** Свойство `type` (List) → метки. */
  tags: string[];
  /** Свойство `links` (List of links) → исходящие связи. */
  links: NoteLink[];
};

export type UpsertResult =
  | { ok: true; trackerId: string; fields: NoteFields }
  | { ok: false; error: "theme_required" | "theme_not_found" | "task_not_found" };

async function resolveTheme(
  tx: Tx,
  workspaceId: string,
  slug: string,
): Promise<{ projectId: string; boardId: string } | null> {
  const [row] = await tx
    .select({ projectId: projects.id, boardId: boards.id })
    .from(projects)
    .innerJoin(boards, eq(boards.projectId, projects.id))
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.slug, slug)))
    .limit(1);
  return row ?? null;
}

async function notStartedColumn(tx: Tx, boardId: string): Promise<{ id: string }> {
  const cols = await tx
    .select({ id: columns.id, name: columns.name })
    .from(columns)
    .where(eq(columns.boardId, boardId))
    .orderBy(asc(columns.orderKey));
  const target = cols.find((c) => c.name === NOT_STARTED_COLUMN) ?? cols[0];
  if (!target) throw new Error("Board has no columns");
  return { id: target.id };
}

async function firstOrderKey(tx: Tx, columnId: string): Promise<string> {
  const [first] = await tx
    .select({ orderKey: tasks.orderKey })
    .from(tasks)
    .where(eq(tasks.columnId, columnId))
    .orderBy(asc(tasks.orderKey))
    .limit(1);
  return keyBetween(null, first?.orderKey ?? null);
}

/** Метка по имени в пространстве; создаёт при отсутствии (color slate, без иконки). */
async function findOrCreateLabel(tx: Tx, workspaceId: string, name: string): Promise<string> {
  const [existing] = await tx
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.workspaceId, workspaceId), eq(labels.name, name)))
    .limit(1);
  if (existing) return existing.id;
  const id = newId();
  await tx
    .insert(labels)
    .values({ id, workspaceId, name, color: "slate", icon: null, createdAt: new Date() })
    .onConflictDoNothing();
  // На случай гонки по unique(ws,name) — перечитать фактический id.
  const [row] = await tx
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.workspaceId, workspaceId), eq(labels.name, name)))
    .limit(1);
  return row?.id ?? id;
}

/** Приводит метки задачи к набору тегов заметки (Obsidian-owned). */
async function syncLabels(
  tx: Tx,
  workspaceId: string,
  taskId: string,
  tagNames: string[],
): Promise<void> {
  const desired = new Set<string>();
  for (const name of tagNames) {
    const trimmed = name.trim();
    if (trimmed) desired.add(await findOrCreateLabel(tx, workspaceId, trimmed));
  }
  const current = await tx
    .select({ labelId: taskLabels.labelId })
    .from(taskLabels)
    .where(eq(taskLabels.taskId, taskId));
  const currentSet = new Set(current.map((r) => r.labelId));

  const toAdd = [...desired].filter((id) => !currentSet.has(id));
  const toRemove = [...currentSet].filter((id) => !desired.has(id));
  if (toAdd.length > 0) {
    await tx
      .insert(taskLabels)
      .values(toAdd.map((labelId) => ({ taskId, labelId, createdAt: new Date() })))
      .onConflictDoNothing();
  }
  if (toRemove.length > 0) {
    await tx
      .delete(taskLabels)
      .where(and(eq(taskLabels.taskId, taskId), inArray(taskLabels.labelId, toRemove)));
  }
}

/** Резолвит цель связи: сначала по tracker_id, затем по заголовку в пространстве. */
async function resolveLinkTarget(
  tx: Tx,
  workspaceId: string,
  link: NoteLink,
  selfId: string,
): Promise<string | null> {
  if (link.trackerId) {
    const [row] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, link.trackerId), eq(tasks.workspaceId, workspaceId)))
      .limit(1);
    if (row && row.id !== selfId) return row.id;
    return null;
  }
  const title = link.title.trim();
  if (!title) return null;
  const [row] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.title, title),
        isNull(tasks.archivedAt),
        ne(tasks.id, selfId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Приводит ИСХОДЯЩИЕ связи задачи к списку `links:` заметки (Obsidian-owned).
 * Входящие связи (из других заметок) не трогаем — ими владеют те заметки.
 */
async function syncLinks(
  tx: Tx,
  workspaceId: string,
  userId: string,
  taskId: string,
  links: NoteLink[],
): Promise<void> {
  const desired = new Map<string, TaskLinkType>(); // targetId → type
  for (const link of links) {
    const targetId = await resolveLinkTarget(tx, workspaceId, link, taskId);
    if (!targetId) continue; // ещё не создан в трекере — пропустим до следующей синхронизации
    desired.set(targetId, isLinkType(link.type) ? link.type : "relates");
  }

  const current = await tx
    .select({ id: taskLinks.id, targetId: taskLinks.targetTaskId, type: taskLinks.type })
    .from(taskLinks)
    .where(and(eq(taskLinks.workspaceId, workspaceId), eq(taskLinks.sourceTaskId, taskId)));

  const currentKeys = new Set(current.map((r) => `${r.targetId}:${r.type}`));
  const toRemove = current.filter((r) => desired.get(r.targetId) !== r.type);
  if (toRemove.length > 0) {
    await tx.delete(taskLinks).where(
      inArray(
        taskLinks.id,
        toRemove.map((r) => r.id),
      ),
    );
  }
  const toAdd = [...desired.entries()].filter(([targetId, type]) => !currentKeys.has(`${targetId}:${type}`));
  if (toAdd.length > 0) {
    await tx
      .insert(taskLinks)
      .values(
        toAdd.map(([targetId, type]) => ({
          id: newId(),
          workspaceId,
          sourceTaskId: taskId,
          targetTaskId: targetId,
          type,
          createdBy: userId,
          createdAt: new Date(),
        })),
      )
      .onConflictDoNothing();
  }
}

/**
 * Создаёт/обновляет задачу из заметки Obsidian.
 *   - Контент/стадию/сроки трекер НЕ берёт из заметки (Obsidian владеет только
 *     заголовком, существованием, тегами и исходящими связями).
 *   - Возвращает tracker_id и поля для записи обратно во frontmatter.
 */
export async function upsertFromNote(
  ctx: { workspaceId: string; userId: string },
  input: UpsertInput,
): Promise<UpsertResult> {
  const { workspaceId, userId } = ctx;
  if (!input.theme.trim()) return { ok: false, error: "theme_required" };

  const result = await db.transaction(async (tx): Promise<UpsertResult> => {
    const theme = await resolveTheme(tx, workspaceId, input.theme.trim());
    if (!theme) return { ok: false, error: "theme_not_found" };

    let taskId = input.trackerId?.trim() || null;

    if (taskId) {
      const [existing] = await tx
        .select({ id: tasks.id, projectId: tasks.projectId, columnId: tasks.columnId })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)))
        .limit(1);
      if (!existing) return { ok: false, error: "task_not_found" };

      // Тема сменилась → переносим задачу в новый проект, в колонку «Не начато».
      const moveProject = existing.projectId !== theme.projectId;
      const patch: Record<string, unknown> = {
        title: input.title,
        obsidianPath: input.path,
        updatedAt: new Date(),
      };
      if (moveProject) {
        const col = await notStartedColumn(tx, theme.boardId);
        patch.projectId = theme.projectId;
        patch.columnId = col.id;
        patch.orderKey = await firstOrderKey(tx, col.id);
      }
      await tx.update(tasks).set(patch).where(eq(tasks.id, taskId));
    } else {
      const col = await notStartedColumn(tx, theme.boardId);
      const id = newId();
      const now = new Date();
      await tx.insert(tasks).values({
        id,
        workspaceId,
        projectId: theme.projectId,
        columnId: col.id,
        title: input.title,
        orderKey: await firstOrderKey(tx, col.id),
        obsidianPath: input.path,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      taskId = id;
    }

    await syncLabels(tx, workspaceId, taskId, input.tags);
    await syncLinks(tx, workspaceId, userId, taskId, input.links);

    const [row] = await selectNoteRows(tx, eq(tasks.id, taskId));
    if (!row) return { ok: false, error: "task_not_found" };
    return { ok: true, trackerId: taskId, fields: buildFields(row) };
  });

  return result;
}

/** Мягко архивирует задачу по пути заметки (удаление в Obsidian). */
export async function deleteByPath(
  workspaceId: string,
  path: string,
): Promise<{ archived: boolean }> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.obsidianPath, path),
        isNull(tasks.archivedAt),
      ),
    )
    .limit(1);
  if (!row) return { archived: false };
  await db
    .update(tasks)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(tasks.id, row.id));
  return { archived: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Обратный канал: задачи, изменившиеся после `since` (статус → Obsidian).
// ─────────────────────────────────────────────────────────────────────────────

export type ChangedNote = {
  path: string;
  archived: boolean;
  fields: NoteFields;
};

/**
 * Связанные с заметками задачи (obsidian_path задан), обновлённые после `since`.
 * Плагин по path находит заметку и переписывает трекер-владеемые свойства.
 */
export async function changedSince(workspaceId: string, since: Date): Promise<ChangedNote[]> {
  const rows = await selectNoteRows(
    db,
    and(eq(tasks.workspaceId, workspaceId), gt(tasks.updatedAt, since)),
  );
  return rows
    .filter((r) => r.obsidianPath)
    .map((r) => ({
      path: r.obsidianPath as string,
      archived: r.archivedAt != null,
      fields: buildFields(r),
    }));
}

import "server-only";

import { and, asc, count, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { boards, columns, projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { keysBetween } from "@/domain/ordering";
import { newId, randomSlug } from "@/lib/ids";
import { type LabelColorSlug } from "@/lib/colors";

export type ProjectSummary = {
  id: string;
  slug: string;
  name: string;
  color: string;
  archivedAt: Date | null;
  createdAt: Date;
};

/**
 * Колонки доски = стадии жизненного цикла документа ОРД.
 * WIP-лимиты стоят на «бутылочных горлышках» — согласовании и утверждении,
 * где обычно ждут руководителя; превышение подсветит затор.
 */
const DEFAULT_COLUMNS: { name: string; color: LabelColorSlug; wipLimit: number | null }[] = [
  { name: "Не начато", color: "slate", wipLimit: null },
  { name: "Разработка проекта", color: "blue", wipLimit: null },
  { name: "Согласование", color: "amber", wipLimit: 3 },
  { name: "Утверждение", color: "violet", wipLimit: 2 },
  { name: "Ввод в действие", color: "cyan", wipLimit: null },
  { name: "Ознакомление", color: "teal", wipLimit: null },
  { name: "Готово", color: "green", wipLimit: null },
];

export async function listForWorkspace(workspaceId: string): Promise<ProjectSummary[]> {
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
    .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.createdAt));
  return rows;
}

export async function getBySlug(
  workspaceId: string,
  slug: string,
): Promise<(ProjectSummary & { boardId: string }) | null> {
  const [row] = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      color: projects.color,
      archivedAt: projects.archivedAt,
      createdAt: projects.createdAt,
      boardId: boards.id,
    })
    .from(projects)
    .innerJoin(boards, eq(boards.projectId, projects.id))
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.slug, slug)))
    .limit(1);
  return row ?? null;
}

export type ProjectProgress = { done: number; total: number };

/**
 * Готовность комплекта (проекта-темы): доля завершённых документов среди
 * корневых, неархивных задач. Считается без учёта фильтров доски.
 */
export async function progress(projectId: string): Promise<ProjectProgress> {
  const [row] = await db
    .select({
      total: count(),
      done: count(tasks.completedAt),
    })
    .from(tasks)
    .where(
      and(eq(tasks.projectId, projectId), isNull(tasks.parentId), isNull(tasks.archivedAt)),
    );
  return { done: Number(row?.done ?? 0), total: Number(row?.total ?? 0) };
}

export type CreateProjectInput = {
  workspaceId: string;
  name: string;
  color?: LabelColorSlug;
  createdBy: string;
};

export async function create(input: CreateProjectInput): Promise<ProjectSummary & { boardId: string }> {
  const projectId = newId();
  const boardId = newId();
  const slug = randomSlug(projectId);
  const color = input.color ?? "slate";
  const now = new Date();

  const orderKeys = keysBetween(null, null, DEFAULT_COLUMNS.length);

  await db.transaction(async (tx) => {
    await tx.insert(projects).values({
      id: projectId,
      workspaceId: input.workspaceId,
      slug,
      name: input.name,
      color,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(boards).values({ id: boardId, projectId, name: "Board", createdAt: now });
    await tx.insert(columns).values(
      DEFAULT_COLUMNS.map((c, i) => ({
        id: newId(),
        boardId,
        name: c.name,
        color: c.color,
        wipLimit: c.wipLimit,
        orderKey: orderKeys[i],
        createdAt: now,
      })),
    );
  });

  return {
    id: projectId,
    slug,
    name: input.name,
    color,
    archivedAt: null,
    createdAt: now,
    boardId,
  };
}

export async function rename(workspaceId: string, projectId: string, name: string): Promise<void> {
  await db
    .update(projects)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));
}

export async function setColor(
  workspaceId: string,
  projectId: string,
  color: LabelColorSlug,
): Promise<void> {
  await db
    .update(projects)
    .set({ color, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));
}

export async function setDescription(
  workspaceId: string,
  projectId: string,
  description: string | null,
): Promise<void> {
  await db
    .update(projects)
    .set({ description, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));
}

export async function getById(
  workspaceId: string,
  projectId: string,
): Promise<(ProjectSummary & { description: string | null }) | null> {
  const [row] = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      color: projects.color,
      description: projects.description,
      archivedAt: projects.archivedAt,
      createdAt: projects.createdAt,
      workspaceId: projects.workspaceId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    color: row.color,
    description: row.description,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  };
}

export async function archive(workspaceId: string, projectId: string): Promise<void> {
  await db
    .update(projects)
    .set({ archivedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));
}

export async function remove(workspaceId: string, projectId: string): Promise<void> {
  const { purgeForProject } = await import("@/services/attachments");
  await purgeForProject(workspaceId, projectId);
  await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));
}

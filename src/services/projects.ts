import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { boards, columns, projects } from "@/db/schema/projects";
import { keysBetween } from "@/domain/ordering";
import { newId, randomSlug } from "@/lib/ids";
import { DEFAULT_COLUMN_COLORS, type LabelColorSlug } from "@/lib/colors";

export type ProjectSummary = {
  id: string;
  slug: string;
  name: string;
  color: string;
  archivedAt: Date | null;
  createdAt: Date;
};

const DEFAULT_COLUMNS = [
  { name: "Задача", color: DEFAULT_COLUMN_COLORS[0] as LabelColorSlug },
  { name: "В работе", color: DEFAULT_COLUMN_COLORS[1] as LabelColorSlug },
  { name: "Готово", color: DEFAULT_COLUMN_COLORS[2] as LabelColorSlug },
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

  db.transaction((tx) => {
    tx.insert(projects)
      .values({
        id: projectId,
        workspaceId: input.workspaceId,
        slug,
        name: input.name,
        color,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(boards)
      .values({ id: boardId, projectId, name: "Board", createdAt: now })
      .run();
    tx.insert(columns)
      .values(
        DEFAULT_COLUMNS.map((c, i) => ({
          id: newId(),
          boardId,
          name: c.name,
          color: c.color,
          orderKey: orderKeys[i],
          createdAt: now,
        })),
      )
      .run();
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

import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { boards, columns, projects } from "@/db/schema/projects";
import { keyBetween } from "@/domain/ordering";
import { newId } from "@/lib/ids";
import { isLabelColor, type LabelColorSlug } from "@/lib/colors";

export type ColumnRow = {
  id: string;
  boardId: string;
  name: string;
  color: string;
  orderKey: string;
  wipLimit: number | null;
};

export async function listForBoard(boardId: string): Promise<ColumnRow[]> {
  return db
    .select({
      id: columns.id,
      boardId: columns.boardId,
      name: columns.name,
      color: columns.color,
      orderKey: columns.orderKey,
      wipLimit: columns.wipLimit,
    })
    .from(columns)
    .where(eq(columns.boardId, boardId))
    .orderBy(asc(columns.orderKey));
}

async function assertBoardInWorkspace(boardId: string, workspaceId: string): Promise<void> {
  const [row] = await db
    .select({ workspaceId: projects.workspaceId })
    .from(boards)
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) {
    throw new Error("Board not in workspace");
  }
}

async function assertColumnInWorkspace(columnId: string, workspaceId: string): Promise<{ boardId: string }> {
  const [row] = await db
    .select({ boardId: columns.boardId, workspaceId: projects.workspaceId })
    .from(columns)
    .innerJoin(boards, eq(boards.id, columns.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .where(eq(columns.id, columnId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) {
    throw new Error("Column not in workspace");
  }
  return { boardId: row.boardId };
}

export type CreateColumnInput = {
  workspaceId: string;
  boardId: string;
  name: string;
  color?: LabelColorSlug;
};

export async function create(input: CreateColumnInput): Promise<ColumnRow> {
  await assertBoardInWorkspace(input.boardId, input.workspaceId);
  const [last] = await db
    .select({ orderKey: columns.orderKey })
    .from(columns)
    .where(eq(columns.boardId, input.boardId))
    .orderBy(desc(columns.orderKey))
    .limit(1);
  const orderKey = keyBetween(last?.orderKey ?? null, null);
  const color = input.color ?? "slate";
  const id = newId();
  const now = new Date();
  await db.insert(columns).values({
    id,
    boardId: input.boardId,
    name: input.name,
    color,
    orderKey,
    createdAt: now,
  });
  return {
    id,
    boardId: input.boardId,
    name: input.name,
    color,
    orderKey,
    wipLimit: null,
  };
}

export async function rename(
  workspaceId: string,
  columnId: string,
  name: string,
): Promise<void> {
  await assertColumnInWorkspace(columnId, workspaceId);
  await db.update(columns).set({ name }).where(eq(columns.id, columnId));
}

export async function setColor(
  workspaceId: string,
  columnId: string,
  color: LabelColorSlug,
): Promise<void> {
  if (!isLabelColor(color)) throw new Error("Unknown color");
  await assertColumnInWorkspace(columnId, workspaceId);
  await db.update(columns).set({ color }).where(eq(columns.id, columnId));
}

export async function remove(workspaceId: string, columnId: string): Promise<void> {
  await assertColumnInWorkspace(columnId, workspaceId);
  await db.delete(columns).where(eq(columns.id, columnId));
}

/**
 * Moves a column to a new position computed from its target neighbors.
 * Caller passes the order keys of neighbors that the column should end up between.
 */
export async function move(
  workspaceId: string,
  columnId: string,
  beforeKey: string | null,
  afterKey: string | null,
): Promise<string> {
  await assertColumnInWorkspace(columnId, workspaceId);
  const orderKey = keyBetween(beforeKey, afterKey);
  await db.update(columns).set({ orderKey }).where(eq(columns.id, columnId));
  return orderKey;
}


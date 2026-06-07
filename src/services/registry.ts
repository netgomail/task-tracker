import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { tasks } from "@/db/schema/tasks";
import { boards, columns, projects } from "@/db/schema/projects";
import { asPriority, asTaskType } from "@/domain/type-guards";
import type { TaskPriority, TaskType } from "@/domain/types";

export type RegistryRow = {
  id: string;
  projectSlug: string;
  theme: string;
  title: string;
  type: TaskType;
  stage: string;
  priority: TaskPriority;
  assignee: string | null;
  dueAt: string | null;
  reviewAt: string | null;
  completedAt: string | null;
};

/**
 * Плоский реестр всех документов ОРД воркспейса (cross-project): корневые,
 * неархивные задачи со стадией (колонкой), темой и исполнителем.
 */
export async function listRegistry(workspaceId: string): Promise<RegistryRow[]> {
  const rows = await db
    .select({
      id: tasks.id,
      projectSlug: projects.slug,
      theme: projects.name,
      title: tasks.title,
      type: tasks.type,
      stage: columns.name,
      priority: tasks.priority,
      assignee: user.name,
      dueAt: tasks.dueAt,
      reviewAt: tasks.reviewAt,
      completedAt: tasks.completedAt,
      projectCreatedAt: projects.createdAt,
      orderKey: tasks.orderKey,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(boards, eq(boards.projectId, projects.id))
    .innerJoin(columns, eq(columns.id, tasks.columnId))
    .leftJoin(user, eq(user.id, tasks.assigneeId))
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.parentId),
        isNull(tasks.archivedAt),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(projects.createdAt), asc(tasks.orderKey));

  return rows.map((r) => ({
    id: r.id,
    projectSlug: r.projectSlug,
    theme: r.theme,
    title: r.title,
    type: asTaskType(r.type),
    stage: r.stage,
    priority: asPriority(r.priority),
    assignee: r.assignee ?? null,
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    reviewAt: r.reviewAt ? r.reviewAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));
}

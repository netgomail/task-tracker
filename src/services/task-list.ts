import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { tasks } from "@/db/schema/tasks";
import { boards, columns, projects } from "@/db/schema/projects";
import { asPriority } from "@/domain/type-guards";
import type { TaskPriority } from "@/domain/types";
import { listForTasks as listLabelsForTasks, type LabelRow } from "@/services/labels";

export type TaskListRow = {
  id: string;
  projectSlug: string;
  projectName: string;
  title: string;
  labels: LabelRow[];
  status: string;
  priority: TaskPriority;
  assignee: string | null;
  dueAt: string | null;
  reviewAt: string | null;
  completedAt: string | null;
};

/**
 * Плоский список всех задач воркспейса (cross-project): корневые,
 * неархивные задачи со статусом (колонкой), проектом и исполнителем.
 */
export async function listAllTasks(workspaceId: string): Promise<TaskListRow[]> {
  const rows = await db
    .select({
      id: tasks.id,
      projectSlug: projects.slug,
      projectName: projects.name,
      title: tasks.title,
      status: columns.name,
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

  const labelMap = await listLabelsForTasks(
    workspaceId,
    rows.map((r) => r.id),
  );

  return rows.map((r) => ({
    id: r.id,
    projectSlug: r.projectSlug,
    projectName: r.projectName,
    title: r.title,
    labels: labelMap.get(r.id) ?? [],
    status: r.status,
    priority: asPriority(r.priority),
    assignee: r.assignee ?? null,
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    reviewAt: r.reviewAt ? r.reviewAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));
}

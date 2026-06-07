import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { tasks } from "@/db/schema/tasks";
import { boards, columns, projects } from "@/db/schema/projects";
import { asTaskType } from "@/domain/type-guards";
import type { TaskType } from "@/domain/types";

const NOT_STARTED_COLUMN = "Не начато";

export type ReadinessGap = { id: string; title: string; type: TaskType };

export type ThemeReadiness = {
  projectId: string;
  slug: string;
  name: string;
  color: string;
  total: number;
  done: number;
  inProgress: number;
  notStarted: number;
  progressPct: number;
  overdueReview: number;
  gaps: ReadinessGap[];
};

/**
 * Готовность каждой темы (проекта): разбивка документов по стадиям и список
 * пробелов (ещё не начатых). Считает только корневые, неархивные задачи.
 */
export async function themesReadiness(workspaceId: string): Promise<ThemeReadiness[]> {
  const rows = await db
    .select({
      projectId: projects.id,
      slug: projects.slug,
      name: projects.name,
      color: projects.color,
      taskId: tasks.id,
      title: tasks.title,
      type: tasks.type,
      completedAt: tasks.completedAt,
      reviewAt: tasks.reviewAt,
      columnName: columns.name,
    })
    .from(projects)
    .innerJoin(boards, eq(boards.projectId, projects.id))
    .leftJoin(
      tasks,
      and(eq(tasks.projectId, projects.id), isNull(tasks.parentId), isNull(tasks.archivedAt)),
    )
    .leftJoin(columns, eq(columns.id, tasks.columnId))
    .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.createdAt), asc(tasks.orderKey));

  const byProject = new Map<string, ThemeReadiness>();
  const now = Date.now();

  for (const r of rows) {
    let theme = byProject.get(r.projectId);
    if (!theme) {
      theme = {
        projectId: r.projectId,
        slug: r.slug,
        name: r.name,
        color: r.color,
        total: 0,
        done: 0,
        inProgress: 0,
        notStarted: 0,
        progressPct: 0,
        overdueReview: 0,
        gaps: [],
      };
      byProject.set(r.projectId, theme);
    }
    if (!r.taskId) continue; // проект без документов
    theme.total += 1;
    if (r.completedAt) {
      theme.done += 1;
      if (r.reviewAt && r.reviewAt.getTime() < now) theme.overdueReview += 1;
    } else if (r.columnName === NOT_STARTED_COLUMN) {
      theme.notStarted += 1;
      theme.gaps.push({ id: r.taskId, title: r.title ?? "", type: asTaskType(r.type ?? "other") });
    } else {
      theme.inProgress += 1;
    }
  }

  const result = [...byProject.values()];
  for (const t of result) {
    t.progressPct = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;
  }
  return result;
}

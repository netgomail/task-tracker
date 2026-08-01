import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { tasks } from "@/db/schema/tasks";
import { boards, columns, projects } from "@/db/schema/projects";
import { isDueOverdue } from "@/lib/due-date";
const NOT_STARTED_COLUMN = "Не начато";

export type ProgressGap = { id: string; title: string };

export type ProjectProgress = {
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
  gaps: ProgressGap[];
};

/**
 * Прогресс каждого проекта: разбивка задач по статусам и список ещё не
 * начатых. Считает только корневые, неархивные задачи.
 */
export async function projectsProgress(workspaceId: string): Promise<ProjectProgress[]> {
  const rows = await db
    .select({
      projectId: projects.id,
      slug: projects.slug,
      name: projects.name,
      color: projects.color,
      taskId: tasks.id,
      title: tasks.title,
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

  const byProject = new Map<string, ProjectProgress>();

  for (const r of rows) {
    let project = byProject.get(r.projectId);
    if (!project) {
      project = {
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
      byProject.set(r.projectId, project);
    }
    if (!r.taskId) continue; // проект без задач
    project.total += 1;
    if (r.completedAt) {
      project.done += 1;
      // day-based, как и везде (см. lib/due-date.ts)
      if (r.reviewAt && isDueOverdue(r.reviewAt.toISOString())) project.overdueReview += 1;
    } else if (r.columnName === NOT_STARTED_COLUMN) {
      project.notStarted += 1;
      project.gaps.push({ id: r.taskId, title: r.title ?? "" });
    } else {
      project.inProgress += 1;
    }
  }

  const result = [...byProject.values()];
  for (const t of result) {
    t.progressPct = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;
  }
  return result;
}

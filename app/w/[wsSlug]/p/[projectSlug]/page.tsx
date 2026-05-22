import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import { listForBoard } from "@/services/columns";
import { listForProject, type TaskFilter, type TaskRow } from "@/services/tasks";
import {
  listForTasks as listLabelsForTasks,
  listForWorkspace as listLabelsForWorkspace,
} from "@/services/labels";
import type { LabelRow } from "@/services/labels";
import { searchTaskIds } from "@/services/search";
import { TASK_PRIORITIES, type TaskPriority } from "@/domain/types";

import { Board, type BoardColumn, type BoardTask } from "./board";
import { BoardFilters } from "./board-filters";

export const dynamic = "force-dynamic";

function toBoardTask(t: TaskRow, labels: LabelRow[] | undefined): BoardTask {
  return {
    id: t.id,
    columnId: t.columnId,
    title: t.title,
    color: t.color,
    type: t.type,
    priority: t.priority,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    orderKey: t.orderKey,
    labels: labels ?? [],
  };
}

function pickPriority(value: string | undefined): TaskPriority | undefined {
  if (!value) return undefined;
  return (TASK_PRIORITIES as readonly string[]).includes(value)
    ? (value as TaskPriority)
    : undefined;
}

function pickString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ProjectBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsSlug: string; projectSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { wsSlug, projectSlug } = await params;
  const sp = await searchParams;
  const session = await requireUser();
  const ws = (await getWorkspaceBySlug(session.user.id, wsSlug))!;
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) notFound();

  const qParam = pickString(sp.q)?.trim() ?? "";
  const priorityParam = pickPriority(pickString(sp.priority));
  const labelParam = pickString(sp.label);

  const matchingIds = qParam
    ? (searchTaskIds(ws.workspaceId, project.id, qParam) ?? undefined)
    : undefined;

  const filter: TaskFilter = {
    priority: priorityParam,
    labelId: labelParam,
    matchingIds,
  };

  const [cols, taskRows, wsLabels] = await Promise.all([
    listForBoard(project.boardId),
    listForProject(project.id, filter),
    listLabelsForWorkspace(ws.workspaceId),
  ]);
  const labelMap = await listLabelsForTasks(
    ws.workspaceId,
    taskRows.map((t) => t.id),
  );

  const columns: BoardColumn[] = cols.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    orderKey: c.orderKey,
  }));
  const tasks: BoardTask[] = taskRows.map((t) => toBoardTask(t, labelMap.get(t.id)));

  return (
    <div className="flex h-[calc(100dvh-49px)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight">{project.name}</h1>
          <span className="text-xs text-muted-foreground">/{project.slug}</span>
        </div>
        <div className="ml-auto">
          <BoardFilters labels={wsLabels} />
        </div>
      </header>
      <Board
        wsSlug={wsSlug}
        projectSlug={projectSlug}
        initialColumns={columns}
        initialTasks={tasks}
      />
    </div>
  );
}

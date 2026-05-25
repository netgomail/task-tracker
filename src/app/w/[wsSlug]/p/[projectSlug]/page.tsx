import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import { listForBoard } from "@/services/columns";
import {
  listForProject,
  listSubtaskAggregates,
  type SubtaskAggregate,
  type TaskFilter,
  type TaskRow,
} from "@/services/tasks";
import {
  listForTasks as listLabelsForTasks,
  listForWorkspace as listLabelsForWorkspace,
} from "@/services/labels";
import type { LabelRow } from "@/services/labels";
import { listMembers, type WorkspaceMember } from "@/services/membership";
import { searchTaskIds } from "@/services/search";
import { TASK_PRIORITIES, type TaskPriority } from "@/domain/types";

import {
  Board,
  type BoardColumn,
  type BoardTask,
  type BoardTaskAssignee,
} from "./board";
import { BoardFilters } from "./board-filters";
import { TaskTable, type TaskTableRow } from "./task-table";
import { ViewToggle, type ViewMode } from "./view-toggle";

export const dynamic = "force-dynamic";

function toBoardTask(
  t: TaskRow,
  labels: LabelRow[] | undefined,
  assignee: BoardTaskAssignee | null,
  subtaskAgg: SubtaskAggregate | undefined,
): BoardTask {
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
    assignee,
    subtasks: (subtaskAgg?.items ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      completed: s.completedAt !== null,
    })),
    subtasksDone: subtaskAgg?.done ?? 0,
  };
}

function pickView(value: string | string[] | undefined): ViewMode {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "table" ? "table" : "board";
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
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) notFound();
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) notFound();

  const qParam = pickString(sp.q)?.trim() ?? "";
  const priorityParam = pickPriority(pickString(sp.priority));
  const labelParam = pickString(sp.label);
  const assigneeParam = pickString(sp.assignee);

  let assigneeFilter: TaskFilter["assignee"];
  if (assigneeParam === "none") assigneeFilter = "unassigned";
  else if (assigneeParam === "me") assigneeFilter = { userId: session.user.id };
  else if (assigneeParam) assigneeFilter = { userId: assigneeParam };

  const matchingIds = qParam
    ? (searchTaskIds(ws.workspaceId, project.id, qParam) ?? undefined)
    : undefined;

  const filter: TaskFilter = {
    priority: priorityParam,
    labelId: labelParam,
    matchingIds,
    assignee: assigneeFilter,
  };

  const [cols, taskRows, wsLabels, members] = await Promise.all([
    listForBoard(project.boardId),
    listForProject(project.id, filter),
    listLabelsForWorkspace(ws.workspaceId),
    listMembers(ws.workspaceId),
  ]);
  const taskIds = taskRows.map((t) => t.id);
  const [labelMap, subtaskMap] = await Promise.all([
    listLabelsForTasks(ws.workspaceId, taskIds),
    listSubtaskAggregates(ws.workspaceId, taskIds),
  ]);
  const membersById = new Map<string, WorkspaceMember>(members.map((m) => [m.id, m]));

  const columns: BoardColumn[] = cols.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    orderKey: c.orderKey,
  }));
  const tasks: BoardTask[] = taskRows.map((t) => {
    const m = t.assigneeId ? membersById.get(t.assigneeId) ?? null : null;
    const assignee: BoardTaskAssignee | null = m
      ? { id: m.id, name: m.name, image: m.image }
      : null;
    return toBoardTask(t, labelMap.get(t.id), assignee, subtaskMap.get(t.id));
  });
  const tableTasks: TaskTableRow[] = tasks.map((t, i) => ({
    ...t,
    createdAt: taskRows[i].createdAt.toISOString(),
  }));

  const view = pickView(sp.view);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight">{project.name}</h1>
          <span className="text-xs text-muted-foreground">/{project.slug}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <ViewToggle projectSlug={projectSlug} current={view} />
          <BoardFilters
            labels={wsLabels}
            members={members}
            currentUserId={session.user.id}
          />
        </div>
      </header>
      {view === "table" ? (
        <TaskTable
          wsSlug={wsSlug}
          projectSlug={projectSlug}
          columns={columns}
          tasks={tableTasks}
          members={members}
        />
      ) : (
        <Board
          wsSlug={wsSlug}
          projectSlug={projectSlug}
          boardId={project.boardId}
          initialColumns={columns}
          initialTasks={tasks}
          members={members}
        />
      )}
    </div>
  );
}

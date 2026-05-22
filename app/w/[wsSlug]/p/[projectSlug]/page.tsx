import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import { listForBoard } from "@/services/columns";
import { listForProject, type TaskRow } from "@/services/tasks";

import { Board, type BoardColumn, type BoardTask } from "./board";

export const dynamic = "force-dynamic";

function toBoardTask(t: TaskRow): BoardTask {
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
  };
}

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ wsSlug: string; projectSlug: string }>;
}) {
  const { wsSlug, projectSlug } = await params;
  const session = await requireUser();
  const ws = (await getWorkspaceBySlug(session.user.id, wsSlug))!;
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) notFound();

  const [cols, taskRows] = await Promise.all([
    listForBoard(project.boardId),
    listForProject(project.id),
  ]);

  const columns: BoardColumn[] = cols.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    orderKey: c.orderKey,
  }));
  const tasks: BoardTask[] = taskRows.map(toBoardTask);

  return (
    <div className="flex h-[calc(100dvh-49px)] flex-col">
      <header className="flex items-baseline gap-3 border-b border-border px-6 py-3">
        <h1 className="text-base font-semibold tracking-tight">{project.name}</h1>
        <span className="text-xs text-muted-foreground">/{project.slug}</span>
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

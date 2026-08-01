import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { listAllTasks } from "@/services/task-list";
import { listForWorkspace as listLabels } from "@/services/labels";

import { PageShell } from "../page-shell";
import { TasksView } from "./tasks-view";

export const dynamic = "force-dynamic";

export default async function AllTasksPage({
  params,
}: {
  params: Promise<{ wsSlug: string }>;
}) {
  const { wsSlug } = await params;
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) notFound();

  const [rows, labels] = await Promise.all([
    listAllTasks(ws.workspaceId),
    listLabels(ws.workspaceId),
  ]);

  return (
    <PageShell>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Задачи
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Все задачи</h1>
        <p className="text-sm text-muted-foreground">
          Все задачи по проектам — со статусом, метками, исполнителем и сроками. Экспорт в CSV.
        </p>
      </div>
      <TasksView wsSlug={wsSlug} rows={rows} labels={labels} />
    </PageShell>
  );
}

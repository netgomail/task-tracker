import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { projectsProgress } from "@/services/progress";

import { PageShell } from "../page-shell";
import { ProgressView } from "./progress-view";

export const dynamic = "force-dynamic";

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ wsSlug: string }>;
}) {
  const { wsSlug } = await params;
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) notFound();

  const projects = await projectsProgress(ws.workspaceId);

  return (
    <PageShell>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Прогресс проектов
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Что готово и что делать дальше</h1>
        <p className="text-sm text-muted-foreground">
          Прогресс по каждому проекту и список незавершённых задач, к которым ещё не приступили.
        </p>
      </div>
      <ProgressView wsSlug={wsSlug} projects={projects} />
    </PageShell>
  );
}

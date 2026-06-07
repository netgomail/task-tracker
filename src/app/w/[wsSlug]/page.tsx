import { requireUser } from "@/lib/rbac";
import { getBySlug } from "@/services/membership";
import { listForWorkspace } from "@/services/projects";
import { listForWorkspace as listSets } from "@/services/document-sets";

import { NewProjectForm } from "./new-project-form";
import { PageShell } from "./page-shell";
import { ProjectCard } from "./project-card";
import { SetLauncher } from "./set-launcher";

export const dynamic = "force-dynamic";

export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ wsSlug: string }>;
}) {
  const { wsSlug } = await params;
  const session = await requireUser();
  const ws = (await getBySlug(session.user.id, wsSlug))!;
  const [projects, sets] = await Promise.all([
    listForWorkspace(ws.workspaceId),
    listSets(ws.workspaceId),
  ]);

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Проекты
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{ws.workspaceName}</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0
              ? "Пока ни одного проекта. Создайте первый."
              : `Активных проектов: ${projects.length}.`}
          </p>
        </div>
        <SetLauncher wsSlug={wsSlug} sets={sets} />
      </div>

      {projects.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              wsSlug={wsSlug}
              id={p.id}
              slug={p.slug}
              name={p.name}
              color={p.color}
            />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">Создать проект</h2>
        <NewProjectForm wsSlug={wsSlug} />
      </section>
    </PageShell>
  );
}

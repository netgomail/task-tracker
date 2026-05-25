import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive as ArchiveIcon } from "lucide-react";

import { requireUser, hasRole } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { listForWorkspace } from "@/services/projects";
import { listArchivedProjects, listArchivedTasks } from "@/services/archive";

import { ArchiveFilters } from "./archive-filters";
import { ArchiveProjects } from "./archive-projects";
import { ArchiveTable } from "./archive-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function ArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ wsSlug: string }>;
  searchParams: Promise<{ project?: string; q?: string; page?: string }>;
}) {
  const { wsSlug } = await params;
  const sp = await searchParams;
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) notFound();

  const allProjects = await listForWorkspace(ws.workspaceId);
  const archivedProjects = await listArchivedProjects(ws.workspaceId);
  const projectFilter = sp.project && allProjects.some((p) => p.slug === sp.project)
    ? allProjects.find((p) => p.slug === sp.project)
    : undefined;

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const { rows, total } = await listArchivedTasks(ws.workspaceId, {
    projectId: projectFilter?.id,
    query: sp.q,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPermanentlyDelete = hasRole(ws.role, "admin");
  const grandTotal = total + archivedProjects.length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link
          href={`/w/${wsSlug}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {ws.workspaceName}
        </Link>
        <div className="flex items-center gap-2">
          <ArchiveIcon className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Архив</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {grandTotal === 0
            ? "Архив пуст. Когда вы заархивируете проекты или задачи, они появятся здесь."
            : `Архивных проектов: ${archivedProjects.length}, задач: ${total}.`}
        </p>
      </div>

      {archivedProjects.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Проекты ({archivedProjects.length})
          </h2>
          <ArchiveProjects
            wsSlug={wsSlug}
            rows={archivedProjects.map((p) => ({
              id: p.id,
              slug: p.slug,
              name: p.name,
              color: p.color,
              taskCount: p.taskCount,
              archivedAt: p.archivedAt.toISOString(),
            }))}
            canPermanentlyDelete={canPermanentlyDelete}
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Задачи ({total})
        </h2>

        <ArchiveFilters
          wsSlug={wsSlug}
          projects={allProjects.map((p) => ({ slug: p.slug, name: p.name }))}
          currentProject={projectFilter?.slug ?? null}
          currentQuery={sp.q ?? ""}
        />

        {rows.length > 0 ? (
          <ArchiveTable
            wsSlug={wsSlug}
            rows={rows.map((r) => ({
              id: r.id,
              title: r.title,
              priority: r.priority,
              type: r.type,
              projectSlug: r.projectSlug,
              projectName: r.projectName,
              projectColor: r.projectColor,
              archivedAt: r.archivedAt.toISOString(),
              archivedBy: r.archivedBy?.name ?? null,
            }))}
            canPermanentlyDelete={canPermanentlyDelete}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {sp.q || sp.project
                ? "Под фильтры ничего не подошло."
                : archivedProjects.length > 0
                  ? "Архивных задач нет."
                  : "В архиве пока ничего нет."}
            </p>
          </div>
        )}
      </section>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Pager wsSlug={wsSlug} page={page} totalPages={totalPages} sp={sp} />
        </div>
      )}
    </div>
  );
}

function Pager({
  wsSlug,
  page,
  totalPages,
  sp,
}: {
  wsSlug: string;
  page: number;
  totalPages: number;
  sp: { project?: string; q?: string };
}) {
  function href(p: number): string {
    const params = new URLSearchParams();
    if (sp.project) params.set("project", sp.project);
    if (sp.q) params.set("q", sp.q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/w/${wsSlug}/archive${qs ? `?${qs}` : ""}`;
  }
  return (
    <>
      <Link
        href={href(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={`rounded-md border border-border px-3 py-1 ${
          page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-muted"
        }`}
      >
        ←
      </Link>
      <span className="text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Link
        href={href(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        className={`rounded-md border border-border px-3 py-1 ${
          page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-muted"
        }`}
      >
        →
      </Link>
    </>
  );
}

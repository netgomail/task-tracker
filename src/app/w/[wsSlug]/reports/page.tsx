import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { listForWorkspace } from "@/services/projects";
import {
  loadByAssignee,
  summary,
  throughput,
  velocityByAssignee,
} from "@/services/reports";

import { PageShell } from "../page-shell";
import { ReportsFilters } from "./reports-filters";
import { ReportsView } from "./reports-view";

export const dynamic = "force-dynamic";

const DEFAULT_RANGE_DAYS = 30;

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string; project?: string }>;
}) {
  const { wsSlug } = await params;
  const sp = await searchParams;
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) notFound();

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(today.getDate() - DEFAULT_RANGE_DAYS);
  defaultFrom.setHours(0, 0, 0, 0);
  const defaultTo = new Date(today);
  defaultTo.setHours(23, 59, 59, 999);

  const from = parseDate(sp.from, defaultFrom);
  const to = parseDate(sp.to, defaultTo);

  const allProjects = await listForWorkspace(ws.workspaceId);
  const projectFilter = sp.project
    ? allProjects.find((p) => p.slug === sp.project) ?? null
    : null;
  const opts = projectFilter ? { projectId: projectFilter.id } : {};

  const range = { from, to };
  const [sumData, throughputData, velocityData, loadData] = await Promise.all([
    summary(ws.workspaceId, range, opts),
    throughput(ws.workspaceId, range, opts),
    velocityByAssignee(ws.workspaceId, range, opts),
    loadByAssignee(ws.workspaceId, opts),
  ]);

  return (
    <PageShell>
      <div className="flex flex-col gap-1">
        <Link href={`/w/${wsSlug}`} className="text-xs text-muted-foreground hover:text-foreground">
          {ws.workspaceName}
        </Link>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Отчёты</h1>
        </div>
      </div>

      <ReportsFilters
        wsSlug={wsSlug}
        projects={allProjects.map((p) => ({ slug: p.slug, name: p.name }))}
        currentProject={projectFilter?.slug ?? null}
        from={from.toISOString().slice(0, 10)}
        to={to.toISOString().slice(0, 10)}
      />

      <ReportsView
        summary={sumData}
        throughput={throughputData}
        velocity={velocityData}
        load={loadData}
        rangeLabel={`${from.toLocaleDateString("ru")} — ${to.toLocaleDateString("ru")}`}
      />
    </PageShell>
  );
}

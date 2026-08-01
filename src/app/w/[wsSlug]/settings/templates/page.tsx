import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { listForWorkspace as listLabelsForWorkspace } from "@/services/labels";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { listForWorkspace as listTemplatesForWorkspace } from "@/services/templates";
import { listForWorkspace as listSetsForWorkspace } from "@/services/task-sets";

import { PageShell } from "../../page-shell";
import { TemplatesTabs } from "./templates-tabs";

export const dynamic = "force-dynamic";

export default async function TemplatesSettingsPage({
  params,
}: {
  params: Promise<{ wsSlug: string }>;
}) {
  const { wsSlug } = await params;
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) notFound();

  const [templates, labels, sets] = await Promise.all([
    listTemplatesForWorkspace(ws.workspaceId),
    listLabelsForWorkspace(ws.workspaceId),
    listSetsForWorkspace(ws.workspaceId),
  ]);

  return (
    <PageShell>
      <div className="flex flex-col gap-1">
        <Link href={`/w/${wsSlug}`} className="text-xs text-muted-foreground hover:text-foreground">
          {ws.workspaceName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Шаблоны</h1>
        <p className="text-sm text-muted-foreground">
          Шаблон задачи — снимок одной задачи с описанием, подзадачами и метками. Набор —
          снимок целого проекта со всеми задачами и связями. И то и другое можно разворачивать заново.
        </p>
      </div>

      <TemplatesTabs
        wsSlug={wsSlug}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          type: t.type,
          priority: t.priority,
          color: t.color,
          labelIds: t.labels,
          subtasks: t.subtasks,
        }))}
        labels={labels}
        sets={sets}
      />
    </PageShell>
  );
}

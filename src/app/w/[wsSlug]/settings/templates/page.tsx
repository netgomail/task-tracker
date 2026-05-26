import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { listForWorkspace as listLabelsForWorkspace } from "@/services/labels";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { listForWorkspace as listTemplatesForWorkspace } from "@/services/templates";

import { TemplatesManager } from "./templates-manager";

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

  const [templates, labels] = await Promise.all([
    listTemplatesForWorkspace(ws.workspaceId),
    listLabelsForWorkspace(ws.workspaceId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link href={`/w/${wsSlug}`} className="text-xs text-muted-foreground hover:text-foreground">
          {ws.workspaceName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Шаблоны задач</h1>
        <p className="text-sm text-muted-foreground">
          Шаблон — это снимок задачи с описанием, подзадачами и метками. При создании задачи
          можно выбрать «Из шаблона», и поля будут заполнены сразу.
        </p>
      </div>

      <TemplatesManager
        wsSlug={wsSlug}
        initialTemplates={templates.map((t) => ({
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
      />
    </div>
  );
}

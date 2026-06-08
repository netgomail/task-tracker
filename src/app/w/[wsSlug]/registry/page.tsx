import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { listRegistry } from "@/services/registry";
import { listForWorkspace as listLabels } from "@/services/labels";

import { PageShell } from "../page-shell";
import { RegistryView } from "./registry-view";

export const dynamic = "force-dynamic";

export default async function RegistryPage({
  params,
}: {
  params: Promise<{ wsSlug: string }>;
}) {
  const { wsSlug } = await params;
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) notFound();

  const [rows, labels] = await Promise.all([
    listRegistry(ws.workspaceId),
    listLabels(ws.workspaceId),
  ]);

  return (
    <PageShell>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Реестр задач
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Сводный реестр</h1>
        <p className="text-sm text-muted-foreground">
          Все задачи по проектам — со стадией, метками, исполнителем и сроками. Экспорт в CSV.
        </p>
      </div>
      <RegistryView wsSlug={wsSlug} rows={rows} labels={labels} />
    </PageShell>
  );
}

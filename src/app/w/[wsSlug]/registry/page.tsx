import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { listRegistry } from "@/services/registry";

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

  const rows = await listRegistry(ws.workspaceId);

  return (
    <PageShell>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Реестр ОРД
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Сводный реестр документов</h1>
        <p className="text-sm text-muted-foreground">
          Все документы по темам со стадией, исполнителем и сроками. Экспорт для проверок.
        </p>
      </div>
      <RegistryView wsSlug={wsSlug} rows={rows} />
    </PageShell>
  );
}

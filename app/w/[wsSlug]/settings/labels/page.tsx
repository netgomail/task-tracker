import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug } from "@/services/membership";
import { listForWorkspace } from "@/services/labels";

import { LabelsEditor } from "./labels-editor";

export const dynamic = "force-dynamic";

export default async function WorkspaceLabelsPage({
  params,
}: {
  params: Promise<{ wsSlug: string }>;
}) {
  const { wsSlug } = await params;
  const session = await requireUser();
  const ws = await getBySlug(session.user.id, wsSlug);
  if (!ws) notFound();
  const items = await listForWorkspace(ws.workspaceId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link
          href={`/w/${wsSlug}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← {ws.workspaceName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Метки</h1>
        <p className="text-sm text-muted-foreground">
          Цветные метки этого workspace. Назначаются задачам, фильтруют доску.
        </p>
      </div>
      <LabelsEditor wsSlug={wsSlug} initialLabels={items} />
    </div>
  );
}

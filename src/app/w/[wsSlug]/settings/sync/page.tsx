import Link from "next/link";
import { notFound } from "next/navigation";

import { hasRole, requireUser } from "@/lib/rbac";
import { getBySlug } from "@/services/membership";
import { listForWorkspace } from "@/services/sync-tokens";
import { env } from "@/lib/env";

import { PageShell } from "../../page-shell";
import { SyncTokens } from "./sync-client";

export const dynamic = "force-dynamic";

export default async function WorkspaceSyncPage({
  params,
}: {
  params: Promise<{ wsSlug: string }>;
}) {
  const { wsSlug } = await params;
  const session = await requireUser();
  const ws = await getBySlug(session.user.id, wsSlug);
  if (!ws) notFound();
  const tokens = await listForWorkspace(ws.workspaceId);
  const canManage = hasRole(ws.role, "admin");

  return (
    <PageShell>
      <div className="flex flex-col gap-1">
        <Link href={`/w/${wsSlug}`} className="text-muted-foreground hover:text-foreground text-xs">
          {ws.workspaceName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Синхронизация с Obsidian</h1>
        <p className="text-muted-foreground text-sm">
          Токены для плагина Obsidian. Плагин шлёт токен в заголовке{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer</code>.
          Секрет показывается один раз — сохраните его в настройках плагина.
        </p>
      </div>

      <SyncTokens
        wsSlug={wsSlug}
        workspaceSlug={ws.workspaceSlug}
        baseUrl={env.BETTER_AUTH_URL}
        canManage={canManage}
        initialTokens={tokens.map((t) => ({
          id: t.id,
          name: t.name,
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          revokedAt: t.revokedAt?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
        }))}
      />
    </PageShell>
  );
}

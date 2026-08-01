import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug, listAddableUsers, listMembers } from "@/services/membership";

import { PageShell } from "../page-shell";
import { MembersList, RenameForm } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ wsSlug: string }>;
}) {
  const { wsSlug } = await params;
  const session = await requireUser();
  const ws = await getBySlug(session.user.id, wsSlug);
  if (!ws) notFound();
  const canManage = ws.role === "owner" || ws.role === "admin";
  const [members, addableUsers] = await Promise.all([
    listMembers(ws.workspaceId),
    canManage ? listAddableUsers(ws.workspaceId) : Promise.resolve([]),
  ]);

  return (
    <PageShell>
      <div className="flex flex-col gap-1">
        <Link href={`/w/${wsSlug}`} className="text-xs text-muted-foreground hover:text-foreground">
          {ws.workspaceName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Настройки пространства</h1>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Название</h2>
        <RenameForm wsSlug={wsSlug} currentName={ws.workspaceName} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">
          Участники
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {members.length}
          </span>
        </h2>
        <MembersList
          wsSlug={wsSlug}
          meId={session.user.id}
          myRole={ws.role}
          initialMembers={members}
          initialAddableUsers={addableUsers}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Интеграции</h2>
        <div className="flex flex-col gap-2">
          <Link
            href={`/w/${wsSlug}/settings/sync`}
            className="rounded-lg border border-border bg-card px-4 py-3 text-sm hover:bg-accent"
          >
            Синхронизация с Obsidian
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Токены для плагина: статусы, колонки и связи задач
            </span>
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

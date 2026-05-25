import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug, listMembers } from "@/services/membership";

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
  const members = await listMembers(ws.workspaceId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
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
        />
      </section>
    </div>
  );
}

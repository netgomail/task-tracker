import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug } from "@/services/membership";
import { listForUser } from "@/services/workspaces";
import { listForWorkspace } from "@/services/projects";
import { SignOutButton } from "@/app/workspaces/sign-out-button";
import { AppSidebar, type WsWithProjects } from "./app-sidebar";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ wsSlug: string }>;
}) {
  const { wsSlug } = await params;
  const session = await requireUser();
  const ws = await getBySlug(session.user.id, wsSlug);
  if (!ws) notFound();

  const allWorkspaces = await listForUser(session.user.id);
  const wsItems: WsWithProjects[] = await Promise.all(
    allWorkspaces.map(async (w) => ({
      ws: w,
      projects: await listForWorkspace(w.id),
    })),
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Global header */}
      <header className="border-border bg-background flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href="/workspaces"
            className="text-muted-foreground hover:text-foreground text-xs font-medium"
          >
            Пространства
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="truncate text-sm font-semibold tracking-tight">{ws.workspaceName}</span>
          <span className="bg-muted text-muted-foreground hidden rounded-md px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase sm:inline">
            {ws.role}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/w/${wsSlug}/settings/labels`}
            className="text-muted-foreground hover:text-foreground text-xs font-medium"
          >
            Метки
          </Link>
          <SignOutButton />
        </div>
      </header>

      {/* Below header: the card contains sidebar + content together */}
      <main className="flex min-h-0 flex-1 p-1.5">
        <div className="border-border bg-background flex min-h-0 flex-1 overflow-hidden rounded-lg border shadow-sm">
          <AppSidebar wsSlug={wsSlug} wsItems={wsItems} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
        </div>
      </main>
    </div>
  );
}

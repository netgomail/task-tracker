import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug } from "@/services/membership";
import { SignOutButton } from "@/app/workspaces/sign-out-button";

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

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/workspaces"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            ← Workspaces
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-semibold tracking-tight">{ws.workspaceName}</span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {ws.role}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/w/${wsSlug}/settings/labels`}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Метки
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

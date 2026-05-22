import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug } from "@/services/membership";
import { SignOutButton } from "@/app/workspaces/sign-out-button";

// Глобальные хоткеи временно отключены — мешали ввод пробела в полях
// (см. требование пользователя 2026-05-23). Чтобы вернуть, импортируй и
// смонтируй <Hotkeys wsSlug={wsSlug} /> ниже + переписать обработчик так,
// чтобы он не срабатывал внутри Radix Dialog (`closest('[role="dialog"]')`).
// import { Hotkeys } from "./hotkeys";

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
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href="/workspaces"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            ← Workspaces
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="truncate text-sm font-semibold tracking-tight">
            {ws.workspaceName}
          </span>
          <span className="hidden rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
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
      {/* <Hotkeys wsSlug={wsSlug} /> — см. комментарий выше */}
    </div>
  );
}

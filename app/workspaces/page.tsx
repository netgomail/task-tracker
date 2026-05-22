import { requireUser } from "@/lib/rbac";
import * as workspaces from "@/services/workspaces";

import { NewWorkspaceForm } from "./new-workspace-form";
import { SignOutButton } from "./sign-out-button";
import { WorkspaceCard } from "./workspace-card";

export const metadata = { title: "Workspaces — Task Tracker" };
export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const session = await requireUser();
  const list = await workspaces.listForUser(session.user.id);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Task Tracker
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Ваши workspaces</h1>
          <p className="text-sm text-muted-foreground">
            {list.length === 0
              ? "Пока ни одного. Создайте первый, чтобы начать работу."
              : "Выберите рабочее пространство или создайте новое."}
          </p>
        </div>
        <SignOutButton />
      </header>

      {list.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2">
          {list.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              id={ws.id}
              name={ws.name}
              slug={ws.slug}
              role={ws.role}
              canDelete={ws.role === "owner"}
            />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">
          {list.length === 0 ? "Создайте первый workspace" : "Создать workspace"}
        </h2>
        <NewWorkspaceForm
          defaultName={list.length === 0 ? `${session.user.name} — личный` : ""}
        />
      </section>
    </div>
  );
}

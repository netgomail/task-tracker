import { notFound } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { themesReadiness } from "@/services/readiness";

import { ReadinessView } from "./readiness-view";

export const dynamic = "force-dynamic";

export default async function ReadinessPage({
  params,
}: {
  params: Promise<{ wsSlug: string }>;
}) {
  const { wsSlug } = await params;
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) notFound();

  const themes = await themesReadiness(ws.workspaceId);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Готовность комплектов
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Что готово и что делать дальше</h1>
        <p className="text-sm text-muted-foreground">
          Прогресс по каждой теме и список пробелов — документов, к которым ещё не приступили.
        </p>
      </div>
      <ReadinessView wsSlug={wsSlug} themes={themes} />
    </div>
  );
}

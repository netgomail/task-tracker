import Link from "next/link";
import { notFound } from "next/navigation";

import { hasRole, requireUser } from "@/lib/rbac";
import { listForProject } from "@/services/custom-fields";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";

import { FieldsEditor } from "./fields-editor";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ wsSlug: string; projectSlug: string }>;
}) {
  const { wsSlug, projectSlug } = await params;
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) notFound();
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) notFound();

  const fields = await listForProject(project.id);
  const canEdit = hasRole(ws.role, "admin");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link
          href={`/w/${wsSlug}/p/${projectSlug}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← {project.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Настройки проекта</h1>
      </div>

      <section className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between">
          <h2 className="text-base font-medium">Кастомные поля</h2>
          <span className="text-xs text-muted-foreground">
            Поля показываются в карточке задачи под основными.
          </span>
        </header>
        <FieldsEditor
          wsSlug={wsSlug}
          projectSlug={projectSlug}
          canEdit={canEdit}
          initialFields={fields.map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            options: f.options,
            required: f.required,
          }))}
        />
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteWorkspaceAction } from "@/actions/workspaces";

export type WorkspaceCardProps = {
  id: string;
  name: string;
  slug: string;
  role: string;
  canDelete: boolean;
};

export function WorkspaceCard({ id, name, slug, role, canDelete }: WorkspaceCardProps) {
  const [pending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm(
      `Удалить пространство «${name}»? Все проекты и задачи внутри будут потеряны.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", id);
      const result = await deleteWorkspaceAction(fd);
      if (!result.ok) toast.error(result.error);
      else toast.success(`Пространство «${name}» удалено`);
    });
  }

  return (
    <Card className="group relative gap-2 p-4 transition-colors hover:border-foreground/30">
      <Link href={`/w/${slug}`} className="absolute inset-0 z-10 rounded-xl" aria-label={name} />
      <div className="relative z-20 flex items-center justify-between gap-2 pointer-events-none">
        <h2 className="truncate text-base font-semibold">{name}</h2>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {role}
          </span>
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-events-auto"
              onClick={handleDelete}
              disabled={pending}
              aria-label={`Удалить ${name}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <p className="relative z-20 truncate text-xs text-muted-foreground pointer-events-none">/{slug}</p>
    </Card>
  );
}

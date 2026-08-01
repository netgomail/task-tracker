"use client";

import { useState, useTransition } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  permanentlyDeleteProjectAction,
  restoreProjectAction,
} from "@/actions/archive";
import { confirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { colorHexOr } from "@/lib/colors";
import { formatEventDate } from "@/lib/due-date";
import { pluralRu } from "@/lib/plural";

type Row = {
  id: string;
  slug: string;
  name: string;
  color: string;
  taskCount: number;
  archivedAt: string;
};

export function ArchiveProjects({
  wsSlug,
  rows,
  canPermanentlyDelete,
}: {
  wsSlug: string;
  rows: Row[];
  canPermanentlyDelete: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleRestore(projectId: string) {
    setBusyId(projectId);
    startTransition(async () => {
      const result = await restoreProjectAction(wsSlug, projectId);
      setBusyId(null);
      if (result.ok) toast.success("Проект восстановлен");
      else toast.error(result.error);
    });
  }

  async function handleDelete(r: Row) {
    const ok = await confirmDialog({
      title: "Удалить проект навсегда?",
      description: `«${r.name}» (${r.taskCount} ${pluralRu(r.taskCount, "задача", "задачи", "задач")}) будет удалён безвозвратно, вместе с вложениями.`,
    });
    if (!ok) return;
    setBusyId(r.id);
    startTransition(async () => {
      const result = await permanentlyDeleteProjectAction(wsSlug, r.id);
      setBusyId(null);
      if (result.ok) toast.success("Проект удалён");
      else toast.error(result.error);
    });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => {
        const isBusy = busyId === r.id;
        return (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: colorHexOr(r.color) }}
              />
              <span className="truncate font-medium">{r.name}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {r.taskCount === 0 ? "Без задач" : `Задач: ${r.taskCount}`} ·{" "}
              {formatEventDate(r.archivedAt)}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={isBusy}
                onClick={() => handleRestore(r.id)}
              >
                {isBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Восстановить
              </Button>
              {canPermanentlyDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(r)}
                  disabled={isBusy}
                  title="Удалить навсегда"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

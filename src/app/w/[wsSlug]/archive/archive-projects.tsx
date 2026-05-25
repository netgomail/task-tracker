"use client";

import { useState, useTransition } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  permanentlyDeleteProjectAction,
  restoreProjectAction,
} from "@/actions/archive";
import { Button } from "@/components/ui/button";
import { LABEL_COLORS } from "@/lib/colors";

type Row = {
  id: string;
  slug: string;
  name: string;
  color: string;
  taskCount: number;
  archivedAt: string;
};

const COLOR_HEX = new Map<string, string>(LABEL_COLORS.map((c) => [c.slug, c.hex]));

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
  const [confirmId, setConfirmId] = useState<string | null>(null);
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

  function handleDelete(projectId: string) {
    setBusyId(projectId);
    startTransition(async () => {
      const result = await permanentlyDeleteProjectAction(wsSlug, projectId);
      setBusyId(null);
      setConfirmId(null);
      if (result.ok) toast.success("Проект удалён");
      else toast.error(result.error);
    });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => {
        const isBusy = busyId === r.id;
        const isConfirm = confirmId === r.id;
        return (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: COLOR_HEX.get(r.color) ?? "#94a3b8" }}
              />
              <span className="truncate font-medium">{r.name}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {r.taskCount === 0 ? "Без задач" : `Задач: ${r.taskCount}`} ·{" "}
              {formatDate(r.archivedAt)}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={isBusy}
                onClick={() => handleRestore(r.id)}
              >
                {isBusy && !isConfirm ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Восстановить
              </Button>
              {canPermanentlyDelete &&
                (isConfirm ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isBusy}
                      onClick={() => handleDelete(r.id)}
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Точно?
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmId(null)}
                      disabled={isBusy}
                    >
                      Отмена
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmId(r.id)}
                    disabled={isBusy}
                    title="Удалить навсегда"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) {
    return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffMs < 7 * day) {
    return d.toLocaleDateString("ru", { weekday: "short" });
  }
  return d.toLocaleDateString("ru", { day: "2-digit", month: "short", year: "numeric" });
}

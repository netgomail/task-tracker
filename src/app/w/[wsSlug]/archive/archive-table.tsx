"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  permanentlyDeleteTaskAction,
  restoreTaskAction,
} from "@/actions/archive";
import { Button } from "@/components/ui/button";
import { LABEL_COLORS } from "@/lib/colors";

type Row = {
  id: string;
  title: string;
  priority: string;
  type: string;
  projectSlug: string;
  projectName: string;
  projectColor: string;
  archivedAt: string;
  archivedBy: string | null;
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочный",
};

const COLOR_HEX = new Map<string, string>(LABEL_COLORS.map((c) => [c.slug, c.hex]));

export function ArchiveTable({
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

  function handleRestore(taskId: string) {
    setBusyId(taskId);
    startTransition(async () => {
      const result = await restoreTaskAction(wsSlug, taskId);
      setBusyId(null);
      if (result.ok) {
        toast.success("Задача восстановлена");
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete(taskId: string) {
    setBusyId(taskId);
    startTransition(async () => {
      const result = await permanentlyDeleteTaskAction(wsSlug, taskId);
      setBusyId(null);
      setConfirmId(null);
      if (result.ok) {
        toast.success("Задача удалена");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 font-medium">Задача</th>
            <th className="px-3 py-2 font-medium">Проект</th>
            <th className="px-3 py-2 font-medium">Приоритет</th>
            <th className="px-3 py-2 font-medium">Архивировал</th>
            <th className="px-3 py-2 font-medium">Когда</th>
            <th className="px-3 py-2 font-medium text-right">Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isBusy = busyId === r.id;
            const isConfirm = confirmId === r.id;
            return (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: COLOR_HEX.get(r.projectColor) ?? "#94a3b8" }}
                    />
                    <span className="font-medium">{r.title}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/w/${wsSlug}/p/${r.projectSlug}`}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {r.projectName}
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {PRIORITY_LABEL[r.priority] ?? r.priority}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.archivedBy ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDate(r.archivedAt)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
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
                    {canPermanentlyDelete && (
                      isConfirm ? (
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
                      )
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
    return d.toLocaleDateString("ru", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ru", { day: "2-digit", month: "short", year: "numeric" });
}

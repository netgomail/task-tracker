"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { pluralRu } from "@/lib/plural";
import { confirmDialog } from "@/components/confirm-dialog";
import { Layers, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { colorHex, isLabelColor } from "@/lib/colors";
import { deleteSetAction, instantiateSetAction } from "@/actions/task-sets";

export type SetSummary = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  itemCount: number;
};

export function SetLauncher({ wsSlug, sets }: { wsSlug: string; sets: SetSummary[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function launch(id: string) {
    start(async () => {
      const res = await instantiateSetAction(wsSlug, id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Проект создан");
      setOpen(false);
      router.push(`/w/${wsSlug}/p/${res.projectSlug}`);
    });
  }

  async function del(id: string, name: string) {
    if (!(await confirmDialog({ title: "Удалить шаблон набора?", description: `«${name}»` }))) return;
    start(async () => {
      const res = await deleteSetAction(wsSlug, id);
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          <Layers className="size-4" />
          Создать из набора
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>Наборы задач</DialogTitle>
        <DialogDescription>
          Разверните готовый набор задач проекта одним кликом — со связями между ними.
        </DialogDescription>
        {sets.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Шаблонов наборов пока нет. Соберите проект и сохраните его как набор из меню проекта.
          </p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto py-2">
            {sets.map((s) => (
              <li
                key={s.id}
                className="group flex items-center gap-3 rounded-md border border-border p-3"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: isLabelColor(s.color) ? colorHex(s.color) : "#64748b" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.itemCount} {pluralRu(s.itemCount, "задача", "задачи", "задач")}
                    {s.description ? ` · ${s.description}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={pending}
                  onClick={() => launch(s.id)}
                >
                  <Plus className="size-3.5" />
                  Создать
                </Button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => del(s.id, s.name)}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label="Удалить шаблон"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}



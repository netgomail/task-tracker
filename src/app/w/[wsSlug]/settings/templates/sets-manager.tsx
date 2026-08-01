"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { pluralRu } from "@/lib/plural";
import { confirmDialog } from "@/components/confirm-dialog";
import { Layers, Rocket, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { colorHex, isLabelColor } from "@/lib/colors";
import { deleteSetAction, instantiateSetAction } from "@/actions/task-sets";

export type SetView = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  itemCount: number;
};

export function SetsManager({ wsSlug, sets }: { wsSlug: string; sets: SetView[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  async function deploy(id: string, name: string) {
    const ok = await confirmDialog({
      title: "Развернуть набор?",
      description: `«${name}» станет новым проектом.`,
      confirmLabel: "Развернуть",
      destructive: false,
    });
    if (!ok) return;
    start(async () => {
      const res = await instantiateSetAction(wsSlug, id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Набор развёрнут");
      router.push(`/w/${wsSlug}/p/${res.projectSlug}`);
    });
  }

  async function remove(id: string, name: string) {
    if (!(await confirmDialog({ title: "Удалить шаблон набора?", description: `«${name}»` }))) return;
    start(async () => {
      const res = await deleteSetAction(wsSlug, id);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Набор удалён");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Набор — снимок целого проекта: все задачи и связи между ними. Соберите проект и
        сохраните его кнопкой «В набор», затем разворачивайте заново под новый проект.
      </p>

      {sets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Наборов пока нет. Откройте проект и нажмите «В набор», чтобы сохранить его
            задачи и связи как шаблон.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sets.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-md"
                style={{
                  background: isLabelColor(s.color) ? `${colorHex(s.color)}22` : "#64748b22",
                  color: isLabelColor(s.color) ? colorHex(s.color) : "#64748b",
                }}
              >
                <Layers className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.itemCount} {pluralRu(s.itemCount, "задача", "задачи", "задач")}
                  {s.description ? ` · ${s.description}` : ""}
                </div>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={pending}
                onClick={() => deploy(s.id, s.name)}
              >
                <Rocket className="size-3.5" />
                Развернуть
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={pending}
                onClick={() => remove(s.id, s.name)}
                title="Удалить"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}



"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, Rocket, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { colorHex, isLabelColor } from "@/lib/colors";
import { deleteSetAction, instantiateSetAction } from "@/actions/document-sets";

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

  function deploy(id: string, name: string) {
    if (!window.confirm(`Развернуть комплект «${name}» в новый проект-тему?`)) return;
    start(async () => {
      const res = await instantiateSetAction(wsSlug, id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Комплект развёрнут");
      router.push(`/w/${wsSlug}/p/${res.projectSlug}`);
    });
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`Удалить шаблон комплекта «${name}»?`)) return;
    start(async () => {
      const res = await deleteSetAction(wsSlug, id);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Комплект удалён");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Комплект — снимок целой темы: все документы и связи между ними. Соберите тему и
        сохраните её кнопкой «В комплект» в проекте, затем разворачивайте под новую ИСПДн или тему.
      </p>

      {sets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Комплектов пока нет. Откройте тему и нажмите «В комплект», чтобы сохранить её
            документы и связи как шаблон.
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
                  {s.itemCount} {pluralDocs(s.itemCount)}
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

function pluralDocs(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "документ";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "документа";
  return "документов";
}

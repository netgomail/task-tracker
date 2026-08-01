"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { saveProjectAsSetAction } from "@/actions/task-sets";

export function SaveAsSetButton({
  wsSlug,
  projectSlug,
  projectName,
}: {
  wsSlug: string;
  projectSlug: string;
  projectName: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(projectName);
  const [pending, start] = useTransition();

  function save() {
    const next = name.trim();
    if (!next) return;
    start(async () => {
      const res = await saveProjectAsSetAction(wsSlug, projectSlug, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Набор сохранён как шаблон");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" title="Сохранить проект как шаблон набора">
          <Layers className="size-3.5" />
          В набор
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>Сохранить как набор</DialogTitle>
        <DialogDescription>
          Сохранит задачи проекта и связи между ними как шаблон набора — его можно будет развернуть заново как новый проект.
        </DialogDescription>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Название набора"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Отмена
          </Button>
          <Button onClick={save} disabled={pending || !name.trim()}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

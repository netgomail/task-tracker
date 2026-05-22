"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createTaskAction } from "@/actions/tasks";

export function NewTaskForm({
  wsSlug,
  projectSlug,
  columnId,
}: {
  wsSlug: string;
  projectSlug: string;
  columnId: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const next = title.trim();
    if (!next) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("title", next);
      const res = await createTaskAction(wsSlug, projectSlug, columnId, fd);
      if (!res.ok) toast.error(res.error);
      else {
        setTitle("");
        setOpen(true);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="m-2 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-3.5" /> Добавить задачу
      </button>
    );
  }

  return (
    <div className="m-2 flex flex-col gap-2 rounded-md border border-border bg-card p-2">
      <Textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            setOpen(false);
            setTitle("");
          }
        }}
        placeholder="Что нужно сделать?"
        rows={2}
        className="min-h-16 resize-none text-sm"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Создаём…" : "Создать"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setTitle("");
          }}
          disabled={pending}
        >
          Отмена
        </Button>
      </div>
    </div>
  );
}

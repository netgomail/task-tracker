"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";

import { setTaskDescriptionAction } from "@/actions/tasks";
import type { SerializedTask } from "@/actions/task-details";

export function Description({
  wsSlug,
  projectSlug,
  task,
  onRefresh,
}: {
  wsSlug: string;
  projectSlug: string;
  task: SerializedTask;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description ?? "");
  const [prevDesc, setPrevDesc] = useState(task.description ?? "");
  if ((task.description ?? "") !== prevDesc) {
    setPrevDesc(task.description ?? "");
    setDraft(task.description ?? "");
  }

  async function save() {
    setEditing(false);
    if (draft === (task.description ?? "")) return;
    const res = await setTaskDescriptionAction(wsSlug, projectSlug, task.id, draft);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Описание
      </h3>
      {editing ? (
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") {
              setDraft(task.description ?? "");
              setEditing(false);
            }
          }}
          rows={5}
          placeholder="Что нужно сделать, как проверить, ссылки…"
          className="min-h-24 text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-h-12 whitespace-pre-wrap rounded-md border border-transparent bg-transparent p-2 text-left text-sm leading-relaxed text-foreground/90 transition-colors hover:border-border"
        >
          {task.description?.trim() ? (
            task.description
          ) : (
            <span className="text-muted-foreground">Добавьте описание…</span>
          )}
        </button>
      )}
    </section>
  );
}

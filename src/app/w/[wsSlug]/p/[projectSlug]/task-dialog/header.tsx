"use client";

import { useState } from "react";
import { toast } from "sonner";
import { NotebookText } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { obsidianNoteUri } from "@/lib/obsidian";
import { cn } from "@/lib/utils";

import { renameTaskAction, toggleTaskCompleteAction } from "@/actions/tasks";
import type { SerializedTask } from "@/actions/task-details";

export function Header({
  wsSlug,
  projectSlug,
  task,
  pending,
  onRefresh,
}: {
  wsSlug: string;
  projectSlug: string;
  task: SerializedTask;
  pending: boolean;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [prevTitle, setPrevTitle] = useState(task.title);
  if (task.title !== prevTitle) {
    setPrevTitle(task.title);
    setDraft(task.title);
  }

  async function submitRename() {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === task.title) {
      setDraft(task.title);
      return;
    }
    const res = await renameTaskAction(wsSlug, projectSlug, task.id, next);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }

  async function toggleComplete(checked: boolean) {
    const res = await toggleTaskCompleteAction(wsSlug, projectSlug, task.id, checked);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }

  return (
    <div className="flex items-start gap-3">
      <Checkbox
        checked={!!task.completedAt}
        onCheckedChange={(v) => toggleComplete(Boolean(v))}
        disabled={pending}
        className="mt-1.5 size-5"
        aria-label="Выполнено"
      />
      {editing ? (
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitRename();
            }
            if (e.key === "Escape") {
              setDraft(task.title);
              setEditing(false);
            }
          }}
          rows={2}
          className="flex-1 resize-none border-0 bg-transparent text-xl font-semibold shadow-none focus-visible:ring-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "flex-1 text-left text-xl font-semibold leading-snug",
            task.completedAt && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </button>
      )}
      {task.obsidianPath && (
        <a
          href={obsidianNoteUri(task.obsidianPath)}
          className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-md bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-500/20 dark:text-violet-400"
          title={task.obsidianPath}
        >
          <NotebookText className="size-3.5" />
          Obsidian
        </a>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { confirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { createSubtaskAction, deleteTaskAction, renameTaskAction, toggleTaskCompleteAction } from "@/actions/tasks";
import type { SerializedTask } from "@/actions/task-details";

export function Subtasks({
  wsSlug,
  projectSlug,
  taskId,
  subtasks,
  onRefresh,
}: {
  wsSlug: string;
  projectSlug: string;
  taskId: string;
  subtasks: SerializedTask[];
  onRefresh: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const done = subtasks.filter((s) => s.completedAt).length;
  const total = subtasks.length;

  async function add() {
    const next = draft.trim();
    if (!next) {
      setAdding(false);
      return;
    }
    setDraft("");
    setAdding(true);
    const res = await createSubtaskAction(wsSlug, projectSlug, taskId, next);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }

  async function toggle(sub: SerializedTask, checked: boolean) {
    startTransition(async () => {
      const res = await toggleTaskCompleteAction(wsSlug, projectSlug, sub.id, checked);
      if (!res.ok) toast.error(res.error);
      onRefresh();
    });
  }

  async function remove(sub: SerializedTask) {
    if (!(await confirmDialog({ title: "Удалить подзадачу?", description: `«${sub.title}»` }))) return;
    startTransition(async () => {
      const res = await deleteTaskAction(wsSlug, projectSlug, sub.id);
      if (!res.ok) toast.error(res.error);
      onRefresh();
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Подзадачи
          {total > 0 && (
            <span className="ml-2 normal-case tracking-normal">
              {done}/{total}
            </span>
          )}
        </h3>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)} disabled={pending}>
            <Plus className="size-3.5" /> Добавить
          </Button>
        )}
      </div>
      <ul className="ml-1 flex flex-col">
        {subtasks.map((s, i, arr) => (
          <SubtaskItem
            key={s.id}
            wsSlug={wsSlug}
            projectSlug={projectSlug}
            sub={s}
            isLast={i === arr.length - 1}
            parentPending={pending}
            onToggle={(v) => toggle(s, v)}
            onRemove={() => remove(s)}
            onRefresh={onRefresh}
          />
        ))}
      </ul>
      {adding && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            placeholder="Что сделать?"
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={add} disabled={pending}>
            OK
          </Button>
        </div>
      )}
      {total > 0 && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={pending}
          className="mt-1 flex items-center gap-1 self-start text-xs font-medium text-sky-600 transition hover:text-sky-700 hover:underline disabled:opacity-50 dark:text-sky-400 dark:hover:text-sky-300"
        >
          <Plus className="size-3.5" /> Создать подзадачу
        </button>
      )}
    </section>
  );
}

function SubtaskItem({
  wsSlug,
  projectSlug,
  sub,
  isLast,
  parentPending,
  onToggle,
  onRemove,
  onRefresh,
}: {
  wsSlug: string;
  projectSlug: string;
  sub: SerializedTask;
  isLast: boolean;
  parentPending: boolean;
  onToggle: (completed: boolean) => void;
  onRemove: () => void;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sub.title);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setDraft(sub.title);
  }, [sub.title, editing]);

  function submit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === sub.title) {
      setDraft(sub.title);
      return;
    }
    startTransition(async () => {
      const res = await renameTaskAction(wsSlug, projectSlug, sub.id, next);
      if (!res.ok) {
        toast.error(res.error);
        setDraft(sub.title);
      }
      onRefresh();
    });
  }

  const disabled = parentPending || pending;

  return (
    <li
      className={cn(
        "group relative flex items-center gap-2 rounded-md py-1 pl-6 pr-1.5 hover:bg-accent",
        "before:absolute before:left-1.5 before:top-0 before:h-[1.05rem] before:w-3 before:rounded-bl-[3px] before:border-b before:border-l before:border-black/15",
        !isLast &&
          "after:absolute after:left-1.5 after:top-[1.05rem] after:bottom-0 after:border-l after:border-black/15",
      )}
    >
      <Checkbox
        checked={!!sub.completedAt}
        onCheckedChange={(v) => onToggle(Boolean(v))}
        disabled={disabled}
        className="size-4"
        aria-label="Выполнено"
      />
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setDraft(sub.title);
              setEditing(false);
            }
          }}
          maxLength={500}
          className="h-7 flex-1 px-2 text-sm"
        />
      ) : (
        <span
          className={cn(
            "flex-1 text-sm",
            sub.completedAt && "text-muted-foreground line-through",
          )}
        >
          {sub.title}
        </span>
      )}
      {!editing && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => setEditing(true)}
          disabled={disabled}
          aria-label="Редактировать подзадачу"
          title="Редактировать"
        >
          <Pencil className="size-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Удалить подзадачу"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}

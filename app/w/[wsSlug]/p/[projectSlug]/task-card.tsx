"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Trash2, Archive, CalendarClock, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LABEL_COLORS, colorHex, isLabelColor, type LabelColorSlug } from "@/lib/colors";
import { cn } from "@/lib/utils";
import {
  archiveTaskAction,
  deleteTaskAction,
  renameTaskAction,
  setTaskColorAction,
  setTaskPriorityAction,
  setTaskTypeAction,
} from "@/actions/tasks";
import {
  PRIORITY_TONE_CLASSES,
  TASK_PRIORITY_META,
  TASK_TYPE_META,
} from "@/lib/task-meta";
import {
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskPriority,
  type TaskType,
} from "@/domain/types";

import type { BoardTask } from "./board";

type Props = {
  wsSlug: string;
  projectSlug: string;
  task: BoardTask;
};

function formatDue(iso: string): { label: string; overdue: boolean } {
  const d = new Date(iso);
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((d.getTime() - new Date(now.toDateString()).getTime()) / day);
  let label: string;
  if (diffDays === 0) label = "Сегодня";
  else if (diffDays === 1) label = "Завтра";
  else if (diffDays === -1) label = "Вчера";
  else
    label = d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
    });
  return { label, overdue: diffDays < 0 };
}

export function TaskCard({ wsSlug, projectSlug, task }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [pending, startTransition] = useTransition();

  const typeMeta = TASK_TYPE_META[task.type];
  const priMeta = TASK_PRIORITY_META[task.priority];
  const bar = isLabelColor(task.color) ? colorHex(task.color) : "#64748b";
  const due = task.dueAt ? formatDue(task.dueAt) : null;

  function submitRename() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === task.title) {
      setDraft(task.title);
      return;
    }
    startTransition(async () => {
      const res = await renameTaskAction(wsSlug, projectSlug, task.id, next);
      if (!res.ok) {
        toast.error(res.error);
        setDraft(task.title);
      }
    });
  }

  function onColorPick(color: LabelColorSlug) {
    startTransition(async () => {
      const res = await setTaskColorAction(wsSlug, projectSlug, task.id, color);
      if (!res.ok) toast.error(res.error);
    });
  }

  function onPriorityPick(priority: TaskPriority) {
    startTransition(async () => {
      const res = await setTaskPriorityAction(wsSlug, projectSlug, task.id, priority);
      if (!res.ok) toast.error(res.error);
    });
  }

  function onTypePick(type: TaskType) {
    startTransition(async () => {
      const res = await setTaskTypeAction(wsSlug, projectSlug, task.id, type);
      if (!res.ok) toast.error(res.error);
    });
  }

  function onArchive() {
    startTransition(async () => {
      const res = await archiveTaskAction(wsSlug, projectSlug, task.id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Задача в архиве");
    });
  }

  function onDelete() {
    if (!window.confirm(`Удалить задачу «${task.title}»?`)) return;
    startTransition(async () => {
      const res = await deleteTaskAction(wsSlug, projectSlug, task.id);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <div className="group relative flex flex-col gap-1.5 rounded-md border border-border bg-card p-2.5 pl-3 transition-colors hover:border-foreground/30">
      <span
        className="absolute inset-y-1.5 left-0 w-1 rounded-r-sm"
        style={{ background: bar }}
        aria-hidden
      />
      <div className="flex items-start gap-1.5">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
                setDraft(task.title);
                setEditing(false);
              }
            }}
            className="h-7 flex-1 px-2 text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-sm font-medium leading-snug"
          >
            {task.title}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              aria-label="Меню задачи"
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-2">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Тип</DropdownMenuLabel>
            <div className="grid grid-cols-4 gap-1 px-1 pb-1.5">
              {TASK_TYPES.map((t) => {
                const Icon = TASK_TYPE_META[t].Icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTypePick(t)}
                    disabled={pending}
                    className={cn(
                      "flex h-7 items-center justify-center rounded-md ring-1 ring-inset ring-border transition hover:ring-foreground/30 disabled:opacity-50",
                      task.type === t && "bg-accent ring-foreground/40",
                    )}
                    aria-label={TASK_TYPE_META[t].label}
                    title={TASK_TYPE_META[t].label}
                  >
                    <Icon className="size-3.5" />
                  </button>
                );
              })}
            </div>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Приоритет
            </DropdownMenuLabel>
            <div className="grid grid-cols-4 gap-1 px-1 pb-1.5">
              {TASK_PRIORITIES.map((p) => {
                const meta = TASK_PRIORITY_META[p];
                const Icon = meta.Icon;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPriorityPick(p)}
                    disabled={pending}
                    className={cn(
                      "flex h-7 items-center justify-center rounded-md ring-1 ring-inset ring-border transition hover:ring-foreground/30 disabled:opacity-50",
                      task.priority === p && "bg-accent ring-foreground/40",
                      PRIORITY_TONE_CLASSES[meta.tone],
                    )}
                    aria-label={meta.label}
                    title={meta.label}
                  >
                    <Icon className="size-3.5" />
                  </button>
                );
              })}
            </div>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Цвет</DropdownMenuLabel>
            <div className="flex flex-wrap gap-1.5 px-1 pb-2">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => onColorPick(c.slug)}
                  disabled={pending}
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full ring-1 ring-inset ring-black/10 transition hover:scale-110 disabled:opacity-50",
                    task.color === c.slug && "ring-2 ring-foreground/70",
                  )}
                  aria-label={c.label}
                  title={c.label}
                  style={{ background: c.hex }}
                >
                  {task.color === c.slug && <Check className="size-2.5 text-white drop-shadow" />}
                </button>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setEditing(true)}>Переименовать</DropdownMenuItem>
            <DropdownMenuItem onSelect={onArchive} disabled={pending}>
              <Archive className="size-4" /> В архив
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete} disabled={pending} variant="destructive">
              <Trash2 className="size-4" /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span
          className="inline-flex items-center gap-1"
          aria-label={typeMeta.label}
          title={typeMeta.label}
        >
          <typeMeta.Icon className="size-3.5" />
        </span>
        {task.priority !== "normal" && (
          <span
            className={cn("inline-flex items-center", PRIORITY_TONE_CLASSES[priMeta.tone])}
            aria-label={priMeta.label}
            title={priMeta.label}
          >
            <priMeta.Icon className="size-3.5" />
          </span>
        )}
        {due && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
              due.overdue
                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                : "bg-muted text-foreground/70",
            )}
          >
            <CalendarClock className="size-3" />
            {due.label}
          </span>
        )}
      </div>
    </div>
  );
}

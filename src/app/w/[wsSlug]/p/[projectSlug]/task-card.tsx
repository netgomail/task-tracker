"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Archive,
  CalendarClock,
  Check,
  ChevronDown,
  FileText,
  GitBranchPlus,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  LABEL_COLORS,
  colorHex,
  colorSwatchHex,
  colorSwatchLabel,
  isDefaultColor,
  isLabelColor,
  type LabelColorSlug,
} from "@/lib/colors";
import { cn } from "@/lib/utils";
import {
  archiveTaskAction,
  createSubtaskAction,
  deleteTaskAction,
  renameTaskAction,
  setTaskColorAction,
  setTaskPriorityAction,
  setTaskTypeAction,
  toggleTaskCompleteAction,
} from "@/actions/tasks";
import { saveTaskAsTemplateAction } from "@/actions/templates";
import { PRIORITY_TONE_CLASSES, TASK_PRIORITY_META, TASK_TYPE_META } from "@/lib/task-meta";
import { TASK_PRIORITIES, TASK_TYPES, type TaskPriority, type TaskType } from "@/domain/types";

import type { BoardTask, BoardTaskSubtask } from "./board";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [subtreeExpanded, setSubtreeExpanded] = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [titleOverflows, setTitleOverflows] = useState(false);
  const titleRef = useRef<HTMLButtonElement | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    setTitleOverflows(el.scrollHeight - el.clientHeight > 1);
  }, [task.title, titleExpanded]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!titleEditing) setTitleDraft(task.title);
  }, [task.title, titleEditing]);

  function startTitleEdit() {
    setTitleDraft(task.title);
    setTitleEditing(true);
  }

  function submitTitleRename() {
    const next = titleDraft.trim();
    setTitleEditing(false);
    if (!next || next === task.title) {
      setTitleDraft(task.title);
      return;
    }
    startTransition(async () => {
      const res = await renameTaskAction(wsSlug, projectSlug, task.id, next);
      if (!res.ok) {
        toast.error(res.error);
        setTitleDraft(task.title);
      }
    });
  }

  const typeMeta = TASK_TYPE_META[task.type];
  const priMeta = TASK_PRIORITY_META[task.priority];
  const bar = isLabelColor(task.color) ? colorHex(task.color) : "#64748b";
  const due = task.dueAt ? formatDue(task.dueAt) : null;

  function openDialog() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", task.id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function openSubtaskDialog() {
    setSubtaskTitle("");
    setSubtaskOpen(true);
  }

  function submitSubtask() {
    const next = subtaskTitle.trim();
    if (!next) return;
    startTransition(async () => {
      const res = await createSubtaskAction(wsSlug, projectSlug, task.id, next);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Подзадача создана");
        setSubtaskOpen(false);
        setSubtaskTitle("");
        setSubtreeExpanded(true);
      }
    });
  }

  function onToggleSubtask(subtaskId: string, completed: boolean) {
    startTransition(async () => {
      const res = await toggleTaskCompleteAction(wsSlug, projectSlug, subtaskId, completed);
      if (!res.ok) toast.error(res.error);
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
      else
        toast.success("Задача в архиве", {
          action: {
            label: "Открыть архив",
            onClick: () => {
              window.location.href = `/w/${wsSlug}/archive`;
            },
          },
        });
    });
  }

  function onDelete() {
    if (!window.confirm(`Удалить задачу «${task.title}»?`)) return;
    startTransition(async () => {
      const res = await deleteTaskAction(wsSlug, projectSlug, task.id);
      if (!res.ok) toast.error(res.error);
    });
  }

  function openSaveAsTemplate() {
    setTemplateName(task.title);
    setTemplateOpen(true);
  }

  function submitSaveAsTemplate() {
    const next = templateName.trim();
    if (!next) return;
    startTransition(async () => {
      const res = await saveTaskAsTemplateAction(wsSlug, task.id, next);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Шаблон сохранён");
        setTemplateOpen(false);
        setTemplateName("");
      }
    });
  }

  const surface = isDefaultColor(task.color) ? "#ffffff" : `color-mix(in oklab, ${bar} 12%, white)`;

  return (
    <div
      style={{ backgroundColor: surface }}
      className="group relative flex flex-col gap-1.5 rounded-md p-2.5 shadow-xs ring-1 ring-black/5 transition-all hover:shadow-sm hover:ring-black/15"
    >
      <div className="flex items-start gap-1.5">
        <div className="flex flex-1 flex-col gap-0.5">
          {titleEditing ? (
            <Textarea
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={submitTitleRename}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitTitleRename();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setTitleDraft(task.title);
                  setTitleEditing(false);
                }
              }}
              rows={2}
              maxLength={500}
              className="min-h-12 resize-none text-sm leading-snug font-medium"
            />
          ) : (
            <button
              ref={titleRef}
              type="button"
              onClick={openDialog}
              className={cn(
                "cursor-pointer text-left text-sm leading-snug font-medium whitespace-pre-wrap break-words",
                !titleExpanded && "line-clamp-8",
                task.completedAt && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </button>
          )}
          {!titleEditing && (titleOverflows || titleExpanded) && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setTitleExpanded((v) => !v);
              }}
              className="self-start text-[11px] font-medium text-sky-600 transition hover:text-sky-700 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
            >
              {titleExpanded ? "Свернуть" : "Развернуть"}
            </button>
          )}
        </div>
        {!titleEditing && (
          <Button
            variant="ghost"
            size="icon"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              startTitleEdit();
            }}
            className="text-muted-foreground size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label="Редактировать заголовок"
            title="Редактировать"
          >
            <Pencil className="size-3.5" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Меню задачи"
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-2">
            <DropdownMenuLabel className="text-muted-foreground text-xs">Тип</DropdownMenuLabel>
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
                      "ring-border hover:ring-foreground/30 flex h-7 items-center justify-center rounded-md ring-1 transition ring-inset disabled:opacity-50",
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
            <DropdownMenuLabel className="text-muted-foreground text-xs">
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
                      "ring-border hover:ring-foreground/30 flex h-7 items-center justify-center rounded-md ring-1 transition ring-inset disabled:opacity-50",
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
            <DropdownMenuLabel className="text-muted-foreground text-xs">Цвет</DropdownMenuLabel>
            <div className="flex flex-wrap gap-1.5 px-1 pb-2">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => onColorPick(c.slug)}
                  disabled={pending}
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full ring-1 ring-black/10 transition ring-inset hover:scale-110 disabled:opacity-50",
                    task.color === c.slug && "ring-foreground/70 ring-2",
                  )}
                  aria-label={colorSwatchLabel(c.slug)}
                  title={colorSwatchLabel(c.slug)}
                  style={{ background: colorSwatchHex(c.slug) }}
                >
                  {task.color === c.slug && (
                    <Check
                      className={cn(
                        "size-2.5 drop-shadow",
                        isDefaultColor(c.slug) ? "text-zinc-900" : "text-white",
                      )}
                    />
                  )}
                </button>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={openDialog}>Открыть</DropdownMenuItem>
            <DropdownMenuItem onSelect={openSubtaskDialog} disabled={pending}>
              <GitBranchPlus className="size-4" /> Подзадача
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={openSaveAsTemplate} disabled={pending}>
              <FileText className="size-4" /> Сохранить как шаблон…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onArchive} disabled={pending}>
              <Archive className="size-4" /> В архив
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete} disabled={pending} variant="destructive">
              <Trash2 className="size-4" /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
        <span
          className="inline-flex items-center gap-1"
          aria-label={typeMeta.label}
          title={typeMeta.label}
        >
          <typeMeta.Icon className="size-3.5" />
        </span>
        {task.commentsCount > 0 && (
          <span
            className="inline-flex items-center gap-0.5"
            title={`Комментарии: ${task.commentsCount}`}
            aria-label={`${task.commentsCount} комментариев`}
          >
            <MessageSquare className="size-3.5" />
            <span className="tabular-nums">{task.commentsCount}</span>
          </span>
        )}
        {task.attachmentsCount > 0 && (
          <span
            className="inline-flex items-center gap-0.5"
            title={`Вложения: ${task.attachmentsCount}`}
            aria-label={`${task.attachmentsCount} вложений`}
          >
            <Paperclip className="size-3.5" />
            <span className="tabular-nums">{task.attachmentsCount}</span>
          </span>
        )}
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
        {task.assignee && (
          <Avatar
            className="ml-auto size-5"
            title={task.assignee.name}
            aria-label={`Исполнитель: ${task.assignee.name}`}
          >
            {task.assignee.image && (
              <AvatarImage src={task.assignee.image} alt={task.assignee.name} />
            )}
            <AvatarFallback className="text-[10px]">
              {task.assignee.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.map((l) => {
            const hex = isLabelColor(l.color) ? colorHex(l.color) : "#64748b";
            return (
              <span
                key={l.id}
                className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset"
                style={{
                  background: `${hex}1a`,
                  color: hex,
                  borderColor: `${hex}55`,
                }}
              >
                {l.name}
              </span>
            );
          })}
        </div>
      )}
      {task.subtasks.length > 0 && (
        <div className="mt-1 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setSubtreeExpanded((v) => !v)}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex cursor-pointer items-center gap-2 rounded-md px-0.5 py-0.5 text-left transition-colors"
            aria-expanded={subtreeExpanded}
            aria-label="Подзадачи"
          >
            <div className="bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${(task.subtasksDone / task.subtasks.length) * 100}%`,
                  backgroundColor: bar,
                }}
              />
            </div>
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {task.subtasksDone}/{task.subtasks.length}
            </span>
            <ChevronDown
              className={cn(
                "text-muted-foreground size-3.5 transition-transform",
                subtreeExpanded && "rotate-180",
              )}
            />
          </button>
          {subtreeExpanded && (
            <ul
              className="ml-1.5 flex flex-col"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {task.subtasks.map((s, i, arr) => (
                <SubtaskRow
                  key={s.id}
                  wsSlug={wsSlug}
                  projectSlug={projectSlug}
                  subtask={s}
                  isLast={i === arr.length - 1}
                  onToggle={(v) => onToggleSubtask(s.id, v)}
                  parentDisabled={pending}
                />
              ))}
            </ul>
          )}
        </div>
      )}
      <Dialog open={subtaskOpen} onOpenChange={setSubtaskOpen}>
        <DialogContent>
          <DialogTitle>Новая подзадача</DialogTitle>
          <DialogDescription className="sr-only">
            Введите название подзадачи для «{task.title}».
          </DialogDescription>
          <Input
            autoFocus
            value={subtaskTitle}
            onChange={(e) => setSubtaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitSubtask();
              }
            }}
            placeholder="Что сделать?"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSubtaskOpen(false)} disabled={pending}>
              Отмена
            </Button>
            <Button onClick={submitSubtask} disabled={pending || !subtaskTitle.trim()}>
              {pending ? "Создаём…" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogTitle>Сохранить как шаблон</DialogTitle>
          <DialogDescription>
            Будут сохранены: описание, тип, приоритет, цвет, метки и подзадачи.
            Дедлайн и исполнитель не копируются.
          </DialogDescription>
          <Input
            autoFocus
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitSaveAsTemplate();
              }
            }}
            placeholder="Название шаблона"
            maxLength={120}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTemplateOpen(false)} disabled={pending}>
              Отмена
            </Button>
            <Button onClick={submitSaveAsTemplate} disabled={pending || !templateName.trim()}>
              {pending ? "Сохраняем…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubtaskRow({
  wsSlug,
  projectSlug,
  subtask,
  isLast,
  onToggle,
  parentDisabled,
}: {
  wsSlug: string;
  projectSlug: string;
  subtask: BoardTaskSubtask;
  isLast: boolean;
  onToggle: (completed: boolean) => void;
  parentDisabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(subtask.title);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setDraft(subtask.title);
  }, [subtask.title, editing]);

  function submit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === subtask.title) {
      setDraft(subtask.title);
      return;
    }
    startTransition(async () => {
      const res = await renameTaskAction(wsSlug, projectSlug, subtask.id, next);
      if (!res.ok) {
        toast.error(res.error);
        setDraft(subtask.title);
      }
    });
  }

  const disabled = parentDisabled || pending;

  return (
    <li
      className={cn(
        "group/sub relative flex items-center gap-2 py-0.5 pl-4",
        "before:absolute before:left-0 before:top-0 before:h-[0.75rem] before:w-3 before:rounded-bl-[3px] before:border-b before:border-l before:border-black/15",
        !isLast &&
          "after:absolute after:left-0 after:top-[0.75rem] after:bottom-0 after:border-l after:border-black/15",
      )}
    >
      <Checkbox
        checked={subtask.completed}
        onCheckedChange={(v) => onToggle(Boolean(v))}
        disabled={disabled}
        className="size-3.5"
        aria-label={subtask.title}
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
              setDraft(subtask.title);
              setEditing(false);
            }
          }}
          maxLength={500}
          className="h-6 flex-1 px-1.5 text-xs"
        />
      ) : (
        <span
          className={cn(
            "flex-1 truncate text-xs",
            subtask.completed && "text-muted-foreground line-through",
          )}
        >
          {subtask.title}
        </span>
      )}
      {!editing && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setEditing(true)}
          disabled={disabled}
          className="text-muted-foreground size-5 opacity-0 transition-opacity group-hover/sub:opacity-100 focus-visible:opacity-100"
          aria-label="Редактировать подзадачу"
          title="Редактировать"
        >
          <Pencil className="size-3" />
        </Button>
      )}
    </li>
  );
}

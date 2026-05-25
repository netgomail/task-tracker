"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  LABEL_COLORS,
  colorHex,
  colorSwatchHex,
  colorSwatchLabel,
  isDefaultColor,
  type LabelColorSlug,
} from "@/lib/colors";
import type { LabelRow } from "@/services/labels";
import type { WorkspaceMember } from "@/services/membership";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";
import {
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskPriority,
  type TaskType,
} from "@/domain/types";
import {
  PRIORITY_TONE_CLASSES,
  TASK_PRIORITY_META,
  TASK_TYPE_META,
} from "@/lib/task-meta";

import {
  getTaskDetailsAction,
  type SerializedActivity,
  type SerializedComment,
  type SerializedTask,
  type TaskDetailsResult,
} from "@/actions/task-details";
import {
  archiveTaskAction,
  createSubtaskAction,
  deleteTaskAction,
  renameTaskAction,
  setTaskAssigneeAction,
  setTaskColorAction,
  setTaskDescriptionAction,
  setTaskDueAction,
  setTaskPriorityAction,
  setTaskTypeAction,
  toggleTaskCompleteAction,
} from "@/actions/tasks";
import {
  createCommentAction,
  deleteCommentAction,
} from "@/actions/comments";
import {
  attachLabelAction,
  detachLabelAction,
} from "@/actions/labels";

type Props = {
  wsSlug: string;
  projectSlug: string;
  taskId: string;
  onClose: () => void;
};

const TYPE_LABELS: Record<string, string> = {
  "task.create": "создал(а) задачу",
  "task.rename": "переименовал(а) задачу",
  "task.update": "обновил(а) задачу",
  "task.move": "переместил(а) задачу",
  "task.color": "сменил(а) цвет",
  "task.priority": "сменил(а) приоритет",
  "task.type": "сменил(а) тип",
  "task.due": "обновил(а) дедлайн",
  "task.description": "обновил(а) описание",
  "task.complete": "выполнил(а)",
  "task.reopen": "переоткрыл(а)",
  "task.archive": "отправил(а) в архив",
  "task.delete": "удалил(а)",
  "subtask.create": "создал(а) подзадачу",
  "subtask.delete": "удалил(а) подзадачу",
  "comment.create": "оставил(а) комментарий",
  "comment.delete": "удалил(а) комментарий",
  "label.attach": "добавил(а) метку",
  "label.detach": "снял(а) метку",
  "task.assignee": "сменил(а) исполнителя",
};

function toLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

function fromLocalDatetime(value: string): string {
  return value ? new Date(value).toISOString() : "";
}

export function TaskDialog({ wsSlug, projectSlug, taskId, onClose }: Props) {
  const [details, setDetails] = useState<Extract<TaskDetailsResult, { ok: true }> | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset details when taskId changes via render-phase update.
  const [prevTaskId, setPrevTaskId] = useState(taskId);
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId);
    setDetails(null);
    setLoadedFor(null);
  }

  async function reload() {
    const res = await getTaskDetailsAction(wsSlug, projectSlug, taskId);
    if (res.ok) setDetails(res);
    else toast.error(res.error);
    setLoadedFor(taskId);
  }

  useEffect(() => {
    // Fetch task details whenever the dialog targets a different task.
    // The setState inside reload() is the canonical "sync with server" case.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    // reload() captures the latest wsSlug/projectSlug/taskId via closures and is
    // intentionally not depended on — re-running on taskId change is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const loading = loadedFor !== taskId;
  const task = details?.task;

  function refresh() {
    startTransition(reload);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton
        className="max-w-3xl gap-0 p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">Карточка задачи</DialogTitle>
        <DialogDescription className="sr-only">
          Редактирование задачи, подзадач и комментариев.
        </DialogDescription>
        {loading || !task || !details ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Загрузка…
          </div>
        ) : (
          <div className="grid max-h-[80vh] grid-cols-1 sm:grid-cols-[1fr_220px]">
            <div className="flex min-h-0 flex-col overflow-y-auto p-6">
              <Header
                wsSlug={wsSlug}
                projectSlug={projectSlug}
                task={task}
                pending={pending}
                onRefresh={refresh}
              />
              <Separator className="my-4" />
              <Description
                wsSlug={wsSlug}
                projectSlug={projectSlug}
                task={task}
                onRefresh={refresh}
              />
              <Separator className="my-4" />
              <Subtasks
                wsSlug={wsSlug}
                projectSlug={projectSlug}
                taskId={task.id}
                subtasks={details.subtasks}
                onRefresh={refresh}
              />
              <Separator className="my-4" />
              <Comments
                wsSlug={wsSlug}
                projectSlug={projectSlug}
                taskId={task.id}
                meId={details.me.id}
                comments={details.comments}
                onRefresh={refresh}
              />
              <Separator className="my-4" />
              <Activity activity={details.activity} />
            </div>
            <aside className="hidden flex-col gap-4 border-l border-border bg-muted/30 p-4 sm:flex">
              <Sidebar
                wsSlug={wsSlug}
                projectSlug={projectSlug}
                task={task}
                labels={details.labels}
                workspaceLabels={details.workspaceLabels}
                members={details.members}
                assignee={details.assignee}
                pending={pending}
                onRefresh={refresh}
                onClose={onClose}
              />
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Header({
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
    </div>
  );
}

function Description({
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

function Subtasks({
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
    if (!window.confirm(`Удалить подзадачу «${sub.title}»?`)) return;
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

function Comments({
  wsSlug,
  projectSlug,
  taskId,
  meId,
  comments,
  onRefresh,
}: {
  wsSlug: string;
  projectSlug: string;
  taskId: string;
  meId: string;
  comments: SerializedComment[];
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  async function add() {
    const next = draft.trim();
    if (!next) return;
    startTransition(async () => {
      const res = await createCommentAction(wsSlug, projectSlug, taskId, next);
      if (!res.ok) toast.error(res.error);
      else {
        setDraft("");
        onRefresh();
      }
    });
  }

  async function remove(c: SerializedComment) {
    if (!window.confirm("Удалить комментарий?")) return;
    startTransition(async () => {
      const res = await deleteCommentAction(wsSlug, projectSlug, c.id, taskId);
      if (!res.ok) toast.error(res.error);
      onRefresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Комментарии
      </h3>
      <ul className="flex flex-col gap-3">
        {comments.map((c) => (
          <li key={c.id} className="group flex gap-3">
            <Avatar className="size-7">
              {c.author.image && <AvatarImage src={c.author.image} alt={c.author.name} />}
              <AvatarFallback>{c.author.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-medium text-foreground">{c.author.name}</span>
                <span className="text-muted-foreground">{relativeTime(c.createdAt)}</span>
                {c.author.id === meId && (
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    className="ml-auto opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    Удалить
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{c.body}</p>
            </div>
          </li>
        ))}
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground/70">Пока нет комментариев.</p>
        )}
      </ul>
      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Написать комментарий… (Ctrl/⌘+Enter — отправить)"
          rows={2}
          className="min-h-16 text-sm"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={add} disabled={pending || !draft.trim()}>
            Отправить
          </Button>
        </div>
      </div>
    </section>
  );
}

function Activity({ activity }: { activity: SerializedActivity[] }) {
  if (activity.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        История
      </h3>
      <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
        {activity.map((a) => (
          <li key={a.id} className="flex items-baseline gap-2">
            <span className="font-medium text-foreground/80">{a.actor.name}</span>
            <span>{TYPE_LABELS[a.type] ?? a.type}</span>
            <span className="ml-auto">{relativeTime(a.createdAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sidebar({
  wsSlug,
  projectSlug,
  task,
  labels,
  workspaceLabels,
  members,
  assignee,
  pending,
  onRefresh,
  onClose,
}: {
  wsSlug: string;
  projectSlug: string;
  task: SerializedTask;
  labels: LabelRow[];
  workspaceLabels: LabelRow[];
  members: WorkspaceMember[];
  assignee: WorkspaceMember | null;
  pending: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  async function setType(t: TaskType) {
    const res = await setTaskTypeAction(wsSlug, projectSlug, task.id, t);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }
  async function setPriority(p: TaskPriority) {
    const res = await setTaskPriorityAction(wsSlug, projectSlug, task.id, p);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }
  async function setColor(c: LabelColorSlug) {
    const res = await setTaskColorAction(wsSlug, projectSlug, task.id, c);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }
  async function setDue(value: string) {
    const iso = value ? fromLocalDatetime(value) : "";
    const res = await setTaskDueAction(wsSlug, projectSlug, task.id, iso);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }
  async function toggleLabel(labelId: string, attached: boolean) {
    const fn = attached ? detachLabelAction : attachLabelAction;
    const res = await fn(wsSlug, projectSlug, task.id, labelId);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }

  async function pickAssignee(memberId: string | null) {
    const res = await setTaskAssigneeAction(
      wsSlug,
      projectSlug,
      task.id,
      memberId ?? "",
    );
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }

  async function onArchive() {
    if (!window.confirm("Отправить задачу в архив?")) return;
    const res = await archiveTaskAction(wsSlug, projectSlug, task.id);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success("Задача в архиве");
      onClose();
    }
  }
  async function onDelete() {
    if (!window.confirm("Удалить задачу безвозвратно?")) return;
    const res = await deleteTaskAction(wsSlug, projectSlug, task.id);
    if (!res.ok) toast.error(res.error);
    else onClose();
  }

  return (
    <>
      <SidebarBlock title="Тип">
        <div className="grid grid-cols-4 gap-1">
          {TASK_TYPES.map((t) => {
            const Icon = TASK_TYPE_META[t].Icon;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                disabled={pending}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md ring-1 ring-inset ring-border transition hover:ring-foreground/30",
                  task.type === t && "bg-accent ring-foreground/40",
                )}
                title={TASK_TYPE_META[t].label}
                aria-label={TASK_TYPE_META[t].label}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      </SidebarBlock>
      <SidebarBlock title="Приоритет">
        <div className="grid grid-cols-4 gap-1">
          {TASK_PRIORITIES.map((p) => {
            const meta = TASK_PRIORITY_META[p];
            const Icon = meta.Icon;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                disabled={pending}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md ring-1 ring-inset ring-border transition hover:ring-foreground/30",
                  task.priority === p && "bg-accent ring-foreground/40",
                  PRIORITY_TONE_CLASSES[meta.tone],
                )}
                title={meta.label}
                aria-label={meta.label}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      </SidebarBlock>
      <SidebarBlock title="Цвет">
        <div className="flex flex-wrap gap-1.5">
          {LABEL_COLORS.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setColor(c.slug)}
              disabled={pending}
              className={cn(
                "flex size-4 items-center justify-center rounded-full ring-1 ring-inset ring-black/10 transition hover:scale-110 disabled:opacity-50",
                task.color === c.slug && "ring-2 ring-foreground/70",
              )}
              style={{ background: colorSwatchHex(c.slug) }}
              aria-label={colorSwatchLabel(c.slug)}
              title={colorSwatchLabel(c.slug)}
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
      </SidebarBlock>
      <SidebarBlock title="Дедлайн">
        <input
          type="datetime-local"
          value={toLocalDatetime(task.dueAt)}
          onChange={(e) => setDue(e.target.value)}
          disabled={pending}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        />
      </SidebarBlock>
      <SidebarBlock title="Исполнитель">
        <AssigneePicker
          assignee={assignee}
          members={members}
          disabled={pending}
          onPick={pickAssignee}
        />
      </SidebarBlock>
      <SidebarBlock title="Метки">
        <LabelsPicker
          wsSlug={wsSlug}
          attached={labels}
          available={workspaceLabels}
          disabled={pending}
          onToggle={toggleLabel}
        />
      </SidebarBlock>
      <Separator />
      <div className="flex flex-col gap-1.5">
        <Button variant="ghost" size="sm" onClick={onArchive} disabled={pending}>
          В архив
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={pending}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          Удалить
        </Button>
      </div>
    </>
  );
}

function SidebarBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

function AssigneePicker({
  assignee,
  members,
  disabled,
  onPick,
}: {
  assignee: WorkspaceMember | null;
  members: WorkspaceMember[];
  disabled: boolean;
  onPick: (memberId: string | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-2 text-left text-xs disabled:opacity-60"
          aria-label="Исполнитель"
        >
          {assignee ? (
            <>
              <Avatar className="size-5">
                {assignee.image && (
                  <AvatarImage src={assignee.image} alt={assignee.name} />
                )}
                <AvatarFallback className="text-[10px]">
                  {assignee.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate">{assignee.name}</span>
            </>
          ) : (
            <span className="flex-1 text-muted-foreground">Не назначен</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
          <li>
            <button
              type="button"
              onClick={() => onPick(null)}
              disabled={disabled}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent disabled:opacity-50",
                !assignee && "bg-accent",
              )}
            >
              Снять исполнителя
            </button>
          </li>
          {members.length === 0 ? (
            <li className="px-2 py-1 text-xs text-muted-foreground">
              В workspace пока нет участников.
            </li>
          ) : (
            members.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onPick(m.id)}
                  disabled={disabled}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent disabled:opacity-50",
                    assignee?.id === m.id && "bg-accent",
                  )}
                >
                  <Avatar className="size-5">
                    {m.image && <AvatarImage src={m.image} alt={m.name} />}
                    <AvatarFallback className="text-[10px]">
                      {m.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{m.name}</span>
                  {assignee?.id === m.id && (
                    <Check className="size-3.5 text-muted-foreground" />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function LabelsPicker({
  wsSlug,
  attached,
  available,
  disabled,
  onToggle,
}: {
  wsSlug: string;
  attached: LabelRow[];
  available: LabelRow[];
  disabled: boolean;
  onToggle: (labelId: string, attached: boolean) => void;
}) {
  const attachedSet = new Set(attached.map((l) => l.id));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {attached.length === 0 ? (
          <span className="text-xs text-muted-foreground/70">—</span>
        ) : (
          attached.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-foreground/90 ring-1 ring-inset"
              style={{
                background: `${colorHex(l.color)}1f`,
                color: colorHex(l.color),
                borderColor: `${colorHex(l.color)}66`,
              }}
            >
              {l.name}
            </span>
          ))
        )}
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" disabled={disabled} className="justify-start">
            <Plus className="size-3.5" /> Изменить
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          {available.length === 0 ? (
            <div className="flex flex-col gap-1 px-1 py-2">
              <p className="text-xs text-muted-foreground">Меток ещё нет.</p>
              <Link
                href={`/w/${wsSlug}/settings/labels`}
                className="text-xs font-medium text-foreground hover:underline"
              >
                Создать в настройках
              </Link>
            </div>
          ) : (
            <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {available.map((l) => {
                const isOn = attachedSet.has(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(l.id, isOn)}
                      disabled={disabled}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent disabled:opacity-50"
                    >
                      <span
                        className="block size-3 rounded-full ring-1 ring-inset ring-black/10"
                        style={{ background: colorHex(l.color) }}
                      />
                      <span className="flex-1">{l.name}</span>
                      {isOn && <Check className="size-3.5 text-muted-foreground" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

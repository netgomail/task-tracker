"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { ColorPicker } from "@/components/color-picker";
import { confirmDialog } from "@/components/confirm-dialog";
import { Check, Link2, NotebookText, Pencil, Plus, Trash2, X } from "lucide-react";

import { obsidianNoteUri } from "@/lib/obsidian";

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
import type { LabelColorSlug } from "@/lib/colors";
import type { LabelRow } from "@/services/labels";
import type { WorkspaceMember } from "@/services/membership";
import { cn } from "@/lib/utils";
import { isDueOverdue } from "@/lib/due-date";
import { relativeTime } from "@/lib/relative-time";
import {
  TASK_LINK_TYPES,
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskLinkType,
  type TaskPriority,
  type TaskType,
} from "@/domain/types";
import {
  PRIORITY_TONE_CLASSES,
  TASK_LINK_META,
  TASK_PRIORITY_META,
  TASK_TYPE_META,
} from "@/lib/task-meta";
import { LabelBadge } from "@/components/label-badge";

import {
  getTaskDetailsAction,
  type SerializedActivity,
  type SerializedComment,
  type SerializedLink,
  type SerializedTask,
  type TaskDetailsResult,
} from "@/actions/task-details";
import {
  createLinkAction,
  deleteLinkAction,
  searchLinkableAction,
} from "@/actions/task-links";
import type { LinkableTask } from "@/services/task-links";
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
  setTaskReviewAction,
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
import { saveTaskAsTemplateAction } from "@/actions/templates";
import type { FieldDef } from "@/domain/custom-fields";

import { TaskAttachments } from "./task-attachments";
import { TaskCustomFields } from "./task-custom-fields";

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
  "task.review": "обновил(а) срок пересмотра",
  "link.create": "связал(а) документ",
  "link.delete": "убрал(а) связь",
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

function isPast(iso: string | null): boolean {
  // Day-based, как на карточке и в реестре: «просрочено» = календарный день прошёл.
  return iso != null && isDueOverdue(iso);
}

export function TaskDialog({ wsSlug, projectSlug, taskId, onClose }: Props) {
  const [details, setDetails] = useState<Extract<TaskDetailsResult, { ok: true }> | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [contentTab, setContentTab] = useState<"comments" | "history">("comments");

  // Reset details when taskId changes via render-phase update.
  const [prevTaskId, setPrevTaskId] = useState(taskId);
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId);
    setDetails(null);
    setLoadedFor(null);
    setContentTab("comments");
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
              <DocumentSet
                wsSlug={wsSlug}
                taskId={task.id}
                links={details.links}
                onRefresh={refresh}
              />
              <Separator className="my-4" />
              <TaskAttachments
                wsSlug={wsSlug}
                taskId={task.id}
                attachments={details.attachments}
                meId={details.me.id}
                canDeleteAny={details.me.role === "admin" || details.me.role === "owner"}
                onRefresh={refresh}
              />
              <Separator className="my-4" />
              <div className="flex border-b border-border">
                <ContentTabButton
                  active={contentTab === "comments"}
                  onClick={() => setContentTab("comments")}
                  count={details.comments.length}
                >
                  Комментарии
                </ContentTabButton>
                <ContentTabButton
                  active={contentTab === "history"}
                  onClick={() => setContentTab("history")}
                  count={details.activity.length}
                >
                  История
                </ContentTabButton>
              </div>
              <div className="pt-4">
                {contentTab === "comments" && (
                  <Comments
                    wsSlug={wsSlug}
                    projectSlug={projectSlug}
                    taskId={task.id}
                    meId={details.me.id}
                    comments={details.comments}
                    members={details.members}
                    onRefresh={refresh}
                  />
                )}
                {contentTab === "history" && (
                  <Activity activity={details.activity} />
                )}
              </div>
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
                customFields={details.customFields}
                customFieldValues={details.customFieldValues}
                pending={pending}
                onRefresh={refresh}
                onClose={onClose}
              />
            </aside>
          </div>
        )}
        {!loading && task && details && (
          <div className="flex justify-end border-t border-border bg-muted/30 px-6 py-3">
            <Button onClick={onClose}>Сохранить</Button>
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


function DocumentSet({
  wsSlug,
  taskId,
  links,
  onRefresh,
}: {
  wsSlug: string;
  taskId: string;
  links: SerializedLink[];
  onRefresh: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const done = links.filter((l) => l.task.completed).length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Связанные задачи
          {links.length > 0 && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] font-semibold normal-case tracking-normal",
                done === links.length
                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
              )}
            >
              {done}/{links.length} готово
            </span>
          )}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="size-3.5" />
          Связать
        </Button>
      </div>

      {adding && (
        <LinkPicker
          wsSlug={wsSlug}
          taskId={taskId}
          onDone={() => {
            setAdding(false);
            onRefresh();
          }}
        />
      )}

      {links.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          Свяжите задачи, которые нужно сделать вместе с этой.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {links.map((l) => (
            <LinkRow key={l.linkId} wsSlug={wsSlug} taskId={taskId} link={l} onRefresh={onRefresh} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkRow({
  wsSlug,
  taskId,
  link,
  onRefresh,
}: {
  wsSlug: string;
  taskId: string;
  link: SerializedLink;
  onRefresh: () => void;
}) {
  const [pending, start] = useTransition();
  const verb =
    link.direction === "outgoing"
      ? TASK_LINK_META[link.type].forward
      : TASK_LINK_META[link.type].reverse;

  function removeLink() {
    start(async () => {
      const res = await deleteLinkAction(wsSlug, link.linkId, [taskId, link.task.id]);
      if (!res.ok) toast.error(res.error);
      onRefresh();
    });
  }

  return (
    <li
      className={cn(
        "group flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm",
        link.task.completed
          ? "border-border bg-transparent"
          : "border-amber-300/60 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20",
      )}
    >
      <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
        {verb}
      </span>
      <Link
        href={`/w/${wsSlug}/p/${link.task.projectSlug}?task=${link.task.id}`}
        className="flex-1 truncate hover:underline"
        title={link.task.title}
      >
        {link.task.title}
      </Link>
      <span
        className={cn(
          "shrink-0 text-xs",
          link.task.completed ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
        )}
      >
        {link.task.completed ? "✓ готово" : link.task.columnName}
      </span>
      <button
        type="button"
        onClick={removeLink}
        disabled={pending}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        aria-label="Убрать связь"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

function LinkPicker({
  wsSlug,
  taskId,
  onDone,
}: {
  wsSlug: string;
  taskId: string;
  onDone: () => void;
}) {
  const [relType, setRelType] = useState<TaskLinkType>("requires");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkableTask[]>([]);
  const [searching, startSearch] = useTransition();
  const [creating, startCreate] = useTransition();

  useEffect(() => {
    const q = query.trim();
    const id = setTimeout(
      () => {
        if (!q) {
          setResults([]);
          return;
        }
        startSearch(async () => {
          const res = await searchLinkableAction(wsSlug, q, taskId);
          if (res.ok) setResults(res.results);
        });
      },
      q ? 200 : 0,
    );
    return () => clearTimeout(id);
  }, [query, wsSlug, taskId]);

  function pick(target: LinkableTask) {
    startCreate(async () => {
      const res = await createLinkAction(wsSlug, taskId, target.id, relType);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2">
      <div className="flex flex-wrap gap-1">
        {TASK_LINK_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setRelType(t)}
            className={cn(
              "rounded px-2 py-0.5 text-xs transition-colors",
              relType === t
                ? "bg-foreground text-background"
                : "bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {TASK_LINK_META[t].forward}
          </button>
        ))}
      </div>
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Найти документ по названию…"
        className="h-8 text-sm"
      />
      {query.trim() && (
        <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
          {searching && results.length === 0 ? (
            <li className="px-2 py-1 text-xs text-muted-foreground">Поиск…</li>
          ) : results.length === 0 ? (
            <li className="px-2 py-1 text-xs text-muted-foreground">Ничего не найдено</li>
          ) : (
            results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => pick(r)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent"
                >
                  <span className="flex-1 truncate">{r.title}</span>
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** Токен упоминания в теле комментария: @[Имя](userId). */
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

function renderCommentBody(body: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(body.slice(last, idx));
    parts.push(
      <span key={key++} className="font-medium text-primary">
        @{m[1]}
      </span>,
    );
    last = idx + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

/** Незавершённое упоминание перед курсором: "текст @що" → { query: "що", start: индекс "@" }. */
function activeMentionQuery(text: string, cursor: number): { query: string; start: number } | null {
  const upto = text.slice(0, cursor);
  const m = /(?:^|\s)@([^\s@]*)$/.exec(upto);
  if (!m) return null;
  return { query: m[1], start: cursor - m[1].length - 1 };
}

/**
 * В поле ввода упоминание выглядит просто как "@Имя" — без id, чтобы не
 * захламлять форму. Перед отправкой подставляем обратно @[Имя](userId) для
 * каждого выбранного через автодополнение упоминания (по порядку, первое
 * оставшееся вхождение текста "@Имя"). Если пользователь стёр/изменил текст
 * упоминания — оно просто останется обычным текстом, без уведомления.
 */
function resolveMentions(text: string, picked: { name: string; userId: string }[]): string {
  let result = text;
  let searchFrom = 0;
  for (const m of picked) {
    const needle = `@${m.name}`;
    const idx = result.indexOf(needle, searchFrom);
    if (idx === -1) continue;
    const token = `@[${m.name}](${m.userId})`;
    result = result.slice(0, idx) + token + result.slice(idx + needle.length);
    searchFrom = idx + token.length;
  }
  return result;
}

function Comments({
  wsSlug,
  projectSlug,
  taskId,
  meId,
  comments,
  members,
  onRefresh,
}: {
  wsSlug: string;
  projectSlug: string;
  taskId: string;
  meId: string;
  comments: SerializedComment[];
  members: WorkspaceMember[];
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pickedMentions, setPickedMentions] = useState<{ name: string; userId: string }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionMatches = mention
    ? members
        .filter((m) => m.name.toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 6)
    : [];

  function selectMention(m: WorkspaceMember) {
    if (!mention) return;
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, mention.start);
    const after = draft.slice(cursor);
    // В поле показываем только "@Имя" — id не виден пользователю, но
    // остаётся привязанным через pickedMentions до отправки (resolveMentions).
    const token = `@${m.name} `;
    const next = `${before}${token}${after}`;
    setDraft(next);
    setPickedMentions((prev) => [...prev, { name: m.name, userId: m.id }]);
    setMention(null);
    const pos = before.length + token.length;
    queueMicrotask(() => textareaRef.current?.setSelectionRange(pos, pos));
    textareaRef.current?.focus();
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setDraft(value);
    const q = activeMentionQuery(value, e.target.selectionStart);
    setMention(q);
    setMentionIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMention(mentionMatches[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      add();
    }
  }

  async function add() {
    const next = draft.trim();
    if (!next) return;
    const body = resolveMentions(next, pickedMentions);
    startTransition(async () => {
      const res = await createCommentAction(wsSlug, projectSlug, taskId, body);
      if (!res.ok) toast.error(res.error);
      else {
        setDraft("");
        setMention(null);
        setPickedMentions([]);
        onRefresh();
      }
    });
  }

  async function remove(c: SerializedComment) {
    if (!(await confirmDialog({ title: "Удалить комментарий?" }))) return;
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
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {renderCommentBody(c.body)}
              </p>
            </div>
          </li>
        ))}
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground/70">Пока нет комментариев.</p>
        )}
      </ul>
      <div className="relative flex flex-col gap-2">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Написать комментарий… (@ — упомянуть, Ctrl/⌘+Enter — отправить)"
          rows={2}
          className="min-h-16 text-sm"
        />
        {mention && mentionMatches.length > 0 && (
          <ul className="absolute bottom-full left-0 z-10 mb-1 w-56 rounded-md border border-border bg-popover p-1 text-sm shadow-md">
            {mentionMatches.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMention(m);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1 text-left",
                    i === mentionIndex ? "bg-accent" : "hover:bg-accent",
                  )}
                >
                  <Avatar className="size-5">
                    {m.image && <AvatarImage src={m.image} alt={m.name} />}
                    <AvatarFallback className="text-[10px]">
                      {m.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button size="sm" onClick={add} disabled={pending || !draft.trim()}>
            Отправить
          </Button>
        </div>
      </div>
    </section>
  );
}

function ContentTabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
            active ? "bg-foreground/10" : "bg-muted",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

const HISTORY_PAGE_SIZE = 15;

function Activity({ activity }: { activity: SerializedActivity[] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(activity.length / HISTORY_PAGE_SIZE);
  const slice = activity.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);

  if (activity.length === 0) {
    return <p className="text-xs text-muted-foreground/70">История пуста.</p>;
  }

  return (
    <section className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
        {slice.map((a) => (
          <li key={a.id} className="flex items-baseline gap-2">
            <span className="font-medium text-foreground/80">{a.actor.name}</span>
            <span>{TYPE_LABELS[a.type] ?? a.type}</span>
            <span className="ml-auto shrink-0">{relativeTime(a.createdAt)}</span>
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← Назад
          </Button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
          >
            Вперёд →
          </Button>
        </div>
      )}
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
  customFields,
  customFieldValues,
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
  customFields: FieldDef[];
  customFieldValues: Record<string, string>;
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
  async function setReview(value: string) {
    const iso = value ? fromLocalDatetime(value) : "";
    const res = await setTaskReviewAction(wsSlug, projectSlug, task.id, iso);
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
    const okArchive = await confirmDialog({
      title: "Отправить задачу в архив?",
      description: "Вернуть можно со страницы «Архив».",
      confirmLabel: "В архив",
      destructive: false,
    });
    if (!okArchive) return;
    const res = await archiveTaskAction(wsSlug, projectSlug, task.id);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success("Задача в архиве", {
        action: {
          label: "Открыть архив",
          onClick: () => {
            window.location.href = `/w/${wsSlug}/archive`;
          },
        },
      });
      onClose();
    }
  }
  async function onDelete() {
    const okDelete = await confirmDialog({
      title: "Удалить задачу безвозвратно?",
      description: "Вместе с подзадачами, комментариями и вложениями.",
    });
    if (!okDelete) return;
    const res = await deleteTaskAction(wsSlug, projectSlug, task.id);
    if (!res.ok) toast.error(res.error);
    else onClose();
  }
  async function onSaveAsTemplate() {
    const name = window.prompt("Название шаблона:", task.title);
    if (!name || !name.trim()) return;
    const res = await saveTaskAsTemplateAction(wsSlug, task.id, name.trim());
    if (!res.ok) toast.error(res.error);
    else toast.success("Шаблон сохранён");
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
        <ColorPicker value={task.color} onPick={setColor} disabled={pending} size="sm" blankDefault />
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
      <SidebarBlock title="Срок пересмотра">
        <input
          type="datetime-local"
          value={toLocalDatetime(task.reviewAt)}
          onChange={(e) => setReview(e.target.value)}
          disabled={pending}
          className={cn(
            "h-8 w-full rounded-md border border-input bg-background px-2 text-xs",
            isPast(task.reviewAt) && "border-rose-400 text-rose-600 dark:text-rose-400",
          )}
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
      {customFields.length > 0 && (
        <>
          <Separator />
          <TaskCustomFields
            wsSlug={wsSlug}
            projectSlug={projectSlug}
            taskId={task.id}
            fields={customFields}
            values={customFieldValues}
            onRefresh={onRefresh}
          />
        </>
      )}
      <Separator />
      <div className="flex flex-col gap-1.5">
        <Button variant="ghost" size="sm" onClick={onSaveAsTemplate} disabled={pending}>
          Сохранить как шаблон…
        </Button>
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
          attached.map((l) => <LabelBadge key={l.id} label={l} />)
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
                      <LabelBadge label={l} />
                      <span className="flex-1" />
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

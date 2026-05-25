"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { colorHex, isDefaultColor, isLabelColor } from "@/lib/colors";
import { PRIORITY_TONE_CLASSES, TASK_PRIORITY_META, TASK_TYPE_META } from "@/lib/task-meta";
import type { TaskPriority } from "@/domain/types";
import type { WorkspaceMember } from "@/services/membership";

import { TaskDialog } from "./task-dialog";
import type { BoardColumn, BoardTask } from "./board";

type SortKey =
  | "title"
  | "column"
  | "assignee"
  | "priority"
  | "due"
  | "created";

type SortDir = "asc" | "desc";

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
};

export type TaskTableRow = BoardTask & {
  createdAt: string;
};

export function TaskTable({
  wsSlug,
  projectSlug,
  columns,
  tasks,
}: {
  wsSlug: string;
  projectSlug: string;
  columns: BoardColumn[];
  tasks: TaskTableRow[];
  members: WorkspaceMember[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sort = (searchParams.get("sort") as SortKey | null) ?? "created";
  const dir = (searchParams.get("dir") as SortDir | null) ?? "desc";
  const openTaskId = searchParams.get("task");

  const columnById = useMemo(() => {
    const m = new Map<string, BoardColumn>();
    for (const c of columns) m.set(c.id, c);
    return m;
  }, [columns]);

  // useState lazy initializer не вызывается на каждом рендере — нужный
  // снэпшот «сейчас» для подсветки просроченных задач, без нарушения
  // react-hooks/purity (Date.now нельзя в чистом render).
  const [nowMs] = useState(() => Date.now());

  const sorted = useMemo(() => {
    const arr = [...tasks];
    const factor = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title) * factor;
        case "column": {
          const ka = columnById.get(a.columnId)?.orderKey ?? "";
          const kb = columnById.get(b.columnId)?.orderKey ?? "";
          if (ka === kb) return 0;
          return (ka < kb ? -1 : 1) * factor;
        }
        case "assignee": {
          const na = a.assignee?.name ?? "";
          const nb = b.assignee?.name ?? "";
          if (!na && !nb) return 0;
          // Без исполнителя — всегда в конец, независимо от направления
          if (!na) return 1;
          if (!nb) return -1;
          return na.localeCompare(nb) * factor;
        }
        case "priority":
          return (PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]) * factor;
        case "due": {
          const da = a.dueAt ? Date.parse(a.dueAt) : Number.NaN;
          const db = b.dueAt ? Date.parse(b.dueAt) : Number.NaN;
          // Без дедлайна — всегда в конец
          if (Number.isNaN(da) && Number.isNaN(db)) return 0;
          if (Number.isNaN(da)) return 1;
          if (Number.isNaN(db)) return -1;
          return (da - db) * factor;
        }
        case "created":
        default: {
          const ca = Date.parse(a.createdAt);
          const cb = Date.parse(b.createdAt);
          return (ca - cb) * factor;
        }
      }
    });
    return arr;
  }, [tasks, sort, dir, columnById]);

  function setSort(next: SortKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (sort === next) {
      params.set("dir", dir === "asc" ? "desc" : "asc");
    } else {
      params.set("sort", next);
      params.set("dir", next === "created" || next === "due" ? "desc" : "asc");
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function openTask(taskId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", taskId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeTask() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">
          Под фильтры ничего не подошло — или задач ещё нет.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="Задача" k="title" current={sort} dir={dir} onClick={setSort} />
              <SortableHeader label="Статус" k="column" current={sort} dir={dir} onClick={setSort} />
              <SortableHeader label="Исполнитель" k="assignee" current={sort} dir={dir} onClick={setSort} />
              <SortableHeader label="Приоритет" k="priority" current={sort} dir={dir} onClick={setSort} />
              <th className="px-3 py-2 font-medium">Метки</th>
              <SortableHeader label="Дедлайн" k="due" current={sort} dir={dir} onClick={setSort} />
              <SortableHeader label="Создан" k="created" current={sort} dir={dir} onClick={setSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                column={columnById.get(t.columnId)}
                nowMs={nowMs}
                onOpen={() => openTask(t.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {openTaskId && (
        <TaskDialog
          wsSlug={wsSlug}
          projectSlug={projectSlug}
          taskId={openTaskId}
          onClose={closeTask}
        />
      )}
    </>
  );
}

function SortableHeader({
  label,
  k,
  current,
  dir,
  onClick,
}: {
  label: string;
  k: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = current === k;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => onClick(k)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function TaskRow({
  task,
  column,
  nowMs,
  onOpen,
}: {
  task: TaskTableRow;
  column: BoardColumn | undefined;
  nowMs: number;
  onOpen: () => void;
}) {
  const priorityMeta = TASK_PRIORITY_META[task.priority];
  const PriorityIcon = priorityMeta.Icon;
  const typeMeta = TASK_TYPE_META[task.type];
  const TypeIcon = typeMeta.Icon;
  const cardColor = isDefaultColor(task.color)
    ? "transparent"
    : isLabelColor(task.color)
      ? colorHex(task.color)
      : "transparent";
  const columnColor =
    column && isLabelColor(column.color) ? colorHex(column.color) : "#64748b";
  const isOverdue =
    task.dueAt &&
    !task.completedAt &&
    Date.parse(task.dueAt) < nowMs;

  return (
    <tr
      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
      onClick={onOpen}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {cardColor !== "transparent" && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: cardColor }}
            />
          )}
          <TypeIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span
            className={cn(
              "truncate font-medium",
              task.completedAt && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
        </div>
      </td>
      <td className="px-3 py-2">
        {column ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: columnColor }}
            />
            {column.name}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {task.assignee ? (
          <div className="flex items-center gap-2">
            <Avatar className="size-5">
              {task.assignee.image && (
                <AvatarImage src={task.assignee.image} alt={task.assignee.name} />
              )}
              <AvatarFallback className="text-[10px]">
                {task.assignee.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-xs">{task.assignee.name}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs",
            PRIORITY_TONE_CLASSES[priorityMeta.tone],
          )}
        >
          <PriorityIcon className="size-3.5" />
          {priorityMeta.label}
        </span>
      </td>
      <td className="px-3 py-2">
        {task.labels.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {task.labels.slice(0, 3).map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px]"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{
                    background: isLabelColor(l.color) ? colorHex(l.color) : "#64748b",
                  }}
                />
                {l.name}
              </span>
            ))}
            {task.labels.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{task.labels.length - 3}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        {task.dueAt ? (
          <span
            className={cn(
              "text-xs",
              isOverdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
            )}
          >
            {formatDueDate(task.dueAt)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {formatCreatedDate(task.createdAt)}
      </td>
    </tr>
  );
}

function formatDueDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru", { day: "2-digit", month: "short" });
}

function formatCreatedDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day)
    return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * day)
    return d.toLocaleDateString("ru", { weekday: "short" });
  return d.toLocaleDateString("ru", { day: "2-digit", month: "short" });
}

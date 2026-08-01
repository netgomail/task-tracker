"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";

import type { SerializedActivity } from "@/actions/task-details";

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
  "task.review": "изменил(а) напоминание",
  "link.create": "связал(а) задачу",
  "link.delete": "убрал(а) связь",
};

const HISTORY_PAGE_SIZE = 15;

export function Activity({ activity }: { activity: SerializedActivity[] }) {
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

export function ContentTabButton({
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

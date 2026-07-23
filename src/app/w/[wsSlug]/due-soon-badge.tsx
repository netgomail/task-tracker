"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DueSoonTask } from "@/services/tasks";

function label(t: DueSoonTask): string {
  if (t.overdue) return "Просрочено";
  const day = t.dueAt.toDateString();
  return day === new Date().toDateString() ? "Сегодня" : "Завтра";
}

export function DueSoonBadge({ wsSlug, tasks }: { wsSlug: string; tasks: DueSoonTask[] }) {
  const [open, setOpen] = useState(false);
  if (tasks.length === 0) return null;

  const hasOverdue = tasks.some((t) => t.overdue);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors hover:bg-accent",
            hasOverdue
              ? "text-red-600 dark:text-red-400"
              : "text-amber-600 dark:text-amber-400",
          )}
          aria-label="Ближайшие дедлайны"
        >
          <CalendarClock className="size-4" />
          {tasks.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-sm font-medium">
          Дедлайны — сегодня, завтра, просрочено
        </div>
        <ul className="flex max-h-96 flex-col overflow-y-auto">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link
                href={`/w/${wsSlug}/p/${t.projectSlug}?task=${t.id}`}
                onClick={() => setOpen(false)}
                className="flex flex-col gap-0.5 border-b border-border px-3 py-2.5 last:border-0 hover:bg-accent"
              >
                <p className="truncate text-sm leading-snug">{t.title}</p>
                <span
                  className={cn(
                    "text-xs",
                    t.overdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                  )}
                >
                  {label(t)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Link2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TASK_LINK_TYPES, type TaskLinkType } from "@/domain/types";
import { TASK_LINK_META } from "@/lib/task-meta";

import { createLinkAction, deleteLinkAction, searchLinkableAction } from "@/actions/task-links";
import type { SerializedLink } from "@/actions/task-details";
import type { LinkableTask } from "@/services/task-links";

export function TaskLinksSection({
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
        placeholder="Найти задачу по названию…"
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

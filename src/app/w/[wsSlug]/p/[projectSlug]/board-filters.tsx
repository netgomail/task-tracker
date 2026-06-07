"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Search, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { colorHex, isLabelColor } from "@/lib/colors";
import type { LabelRow } from "@/services/labels";
import type { WorkspaceMember } from "@/services/membership";
import { TASK_PRIORITIES, TASK_TYPES, type TaskPriority, type TaskType } from "@/domain/types";
import {
  PRIORITY_TONE_CLASSES,
  TASK_PRIORITY_META,
  TASK_TYPE_META,
  TYPE_TONE_CLASSES,
} from "@/lib/task-meta";

type Props = {
  labels: LabelRow[];
  members: WorkspaceMember[];
  currentUserId: string;
};

export function BoardFilters({ labels, members, currentUserId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const currentQ = searchParams.get("q") ?? "";
  const currentPriority = searchParams.get("priority");
  const currentType = searchParams.get("type");
  const currentLabel = searchParams.get("label");
  const currentAssignee = searchParams.get("assignee");
  const [draftQ, setDraftQ] = useState(currentQ);

  function push(next: URLSearchParams) {
    // Drop the open task dialog when filters change — saved task may be filtered out.
    next.delete("task");
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    push(next);
  }

  function submitSearch() {
    setParam("q", draftQ.trim() || null);
  }

  function reset() {
    setDraftQ("");
    push(new URLSearchParams());
  }

  const activeLabel = labels.find((l) => l.id === currentLabel);
  const activeMember =
    currentAssignee && currentAssignee !== "me" && currentAssignee !== "none"
      ? members.find((m) => m.id === currentAssignee)
      : null;
  const assigneeLabel = activeMember
    ? activeMember.name
    : currentAssignee === "me"
      ? "Мои"
      : currentAssignee === "none"
        ? "Без исполнителя"
        : "Исполнитель";
  const hasActive = Boolean(
    currentQ || currentPriority || currentType || currentLabel || currentAssignee,
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitSearch();
            }
            if (e.key === "Escape") {
              setDraftQ("");
              setParam("q", null);
            }
          }}
          onBlur={() => {
            if (draftQ.trim() !== currentQ) submitSearch();
          }}
          placeholder="Поиск…"
          className="h-8 w-44 pl-7 text-sm"
          disabled={pending}
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", currentPriority && "ring-1 ring-foreground/40")}
            disabled={pending}
          >
            <Filter className="size-3.5" />
            {currentPriority
              ? TASK_PRIORITY_META[currentPriority as TaskPriority].label
              : "Приоритет"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48">
          <ul className="flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                onClick={() => setParam("priority", null)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                  !currentPriority && "bg-accent",
                )}
              >
                Все
              </button>
            </li>
            {TASK_PRIORITIES.map((p) => {
              const meta = TASK_PRIORITY_META[p];
              const Icon = meta.Icon;
              return (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => setParam("priority", p)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                      currentPriority === p && "bg-accent",
                    )}
                  >
                    <Icon className={cn("size-3.5", PRIORITY_TONE_CLASSES[meta.tone])} />
                    {meta.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", currentType && "ring-1 ring-foreground/40")}
            disabled={pending}
          >
            <Filter className="size-3.5" />
            {currentType
              ? TASK_TYPE_META[currentType as TaskType].label
              : "Тип"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56">
          <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => setParam("type", null)}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                  !currentType && "bg-accent",
                )}
              >
                Все
              </button>
            </li>
            {TASK_TYPES.map((t) => {
              const meta = TASK_TYPE_META[t];
              const Icon = meta.Icon;
              return (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => setParam("type", t)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                      currentType === t && "bg-accent",
                    )}
                  >
                    <span className={cn("rounded p-0.5", TYPE_TONE_CLASSES[meta.tone])}>
                      <Icon className="size-3.5" />
                    </span>
                    {meta.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", currentLabel && "ring-1 ring-foreground/40")}
            disabled={pending}
          >
            {activeLabel ? (
              <>
                <span
                  className="block size-2.5 rounded-full"
                  style={{
                    background: isLabelColor(activeLabel.color)
                      ? colorHex(activeLabel.color)
                      : "#64748b",
                  }}
                />
                {activeLabel.name}
              </>
            ) : (
              <>
                <Filter className="size-3.5" /> Метка
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56">
          <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => setParam("label", null)}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                  !currentLabel && "bg-accent",
                )}
              >
                Все
              </button>
            </li>
            {labels.length === 0 ? (
              <li className="px-2 py-1 text-xs text-muted-foreground">
                Меток ещё нет.
              </li>
            ) : (
              labels.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setParam("label", l.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                      currentLabel === l.id && "bg-accent",
                    )}
                  >
                    <span
                      className="block size-3 rounded-full ring-1 ring-inset ring-black/10"
                      style={{
                        background: isLabelColor(l.color) ? colorHex(l.color) : "#64748b",
                      }}
                    />
                    {l.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", currentAssignee && "ring-1 ring-foreground/40")}
            disabled={pending}
          >
            {activeMember ? (
              <>
                <Avatar className="size-4">
                  {activeMember.image && (
                    <AvatarImage src={activeMember.image} alt={activeMember.name} />
                  )}
                  <AvatarFallback className="text-[9px]">
                    {activeMember.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {assigneeLabel}
              </>
            ) : (
              <>
                <Filter className="size-3.5" /> {assigneeLabel}
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56">
          <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => setParam("assignee", null)}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                  !currentAssignee && "bg-accent",
                )}
              >
                Все
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setParam("assignee", "me")}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                  currentAssignee === "me" && "bg-accent",
                )}
              >
                Мои
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setParam("assignee", "none")}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                  currentAssignee === "none" && "bg-accent",
                )}
              >
                Без исполнителя
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
                    onClick={() => setParam("assignee", m.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                      currentAssignee === m.id && "bg-accent",
                    )}
                  >
                    <Avatar className="size-4">
                      {m.image && <AvatarImage src={m.image} alt={m.name} />}
                      <AvatarFallback className="text-[9px]">
                        {m.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">
                      {m.name}
                      {m.id === currentUserId && (
                        <span className="ml-1 text-xs text-muted-foreground">(вы)</span>
                      )}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </PopoverContent>
      </Popover>

      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={pending}
          className="gap-1"
        >
          <X className="size-3.5" /> Сбросить
        </Button>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Plus, UserRound, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { WorkspaceMember } from "@/services/membership";
import { createTaskAction } from "@/actions/tasks";

export function NewTaskForm({
  wsSlug,
  projectSlug,
  columnId,
  members,
}: {
  wsSlug: string;
  projectSlug: string;
  columnId: string;
  members: WorkspaceMember[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const assignee = members.find((m) => m.id === assigneeId) ?? null;

  function submit() {
    const next = title.trim();
    if (!next) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("title", next);
      if (assigneeId) fd.set("assigneeId", assigneeId);
      const res = await createTaskAction(wsSlug, projectSlug, columnId, fd);
      if (!res.ok) toast.error(res.error);
      else {
        setTitle("");
        setAssigneeId(null);
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        data-board-newtask=""
        onClick={() => setOpen(true)}
        className="mx-2.5 mb-1 flex items-center gap-1 self-start rounded-sm py-0.5 text-xs font-medium text-sky-600 transition hover:text-sky-700 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
      >
        <Plus className="size-3.5" /> Добавить задачу
      </button>
    );
  }

  return (
    <div className="mx-2 mb-2 flex flex-col gap-2 rounded-md border border-border bg-card p-2">
      <Textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            setOpen(false);
            setTitle("");
            setAssigneeId(null);
          }
        }}
        placeholder="Что нужно сделать?"
        rows={2}
        className="min-h-16 resize-none text-sm"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Создаём…" : "Создать"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setTitle("");
            setAssigneeId(null);
          }}
          disabled={pending}
        >
          Отмена
        </Button>
        <div className="ml-auto">
          <AssigneePicker
            assignee={assignee}
            members={members}
            disabled={pending}
            onPick={setAssigneeId}
          />
        </div>
      </div>
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
  onPick: (id: string | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={assignee ? assignee.name : "Назначить исполнителя"}
          className={cn(
            "flex size-7 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-accent disabled:opacity-50",
            assignee && "border-transparent bg-transparent",
          )}
        >
          {assignee ? (
            <Avatar className="size-5">
              {assignee.image && <AvatarImage src={assignee.image} alt={assignee.name} />}
              <AvatarFallback className="text-[10px]">
                {assignee.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <UserRound className="size-3.5" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <ul className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
          {assignee && (
            <li>
              <button
                type="button"
                onClick={() => onPick(null)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                Снять исполнителя
              </button>
            </li>
          )}
          {members.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">
              Нет участников
            </li>
          ) : (
            members.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onPick(m.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
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
                  {assignee?.id === m.id && <Check className="size-3.5 shrink-0 text-muted-foreground" />}
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

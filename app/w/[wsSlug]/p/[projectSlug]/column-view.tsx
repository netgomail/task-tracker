"use client";

import { useState, useTransition } from "react";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical, MoreHorizontal, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LABEL_COLORS, colorHex, isLabelColor, type LabelColorSlug } from "@/lib/colors";
import { cn } from "@/lib/utils";
import {
  deleteColumnAction,
  renameColumnAction,
  setColumnColorAction,
} from "@/actions/columns";

import type { BoardColumn, BoardTask } from "./board";
import { NewTaskForm } from "./new-task-form";
import { SortableTaskCard } from "./sortable-task-card";

type Props = {
  wsSlug: string;
  projectSlug: string;
  column: BoardColumn;
  tasks: BoardTask[];
};

export function ColumnView({ wsSlug, projectSlug, column, tasks }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: "column" },
  });
  // Backup droppable on the inner body so empty columns still receive a drop.
  const { setNodeRef: setBodyRef, isOver } = useDroppable({
    id: `col-body:${column.id}`,
    data: { type: "column", columnId: column.id },
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.name);
  const [pending, startTransition] = useTransition();

  const style = { transform: CSS.Transform.toString(transform), transition };
  const bar = isLabelColor(column.color) ? colorHex(column.color) : "#64748b";

  function submitRename() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === column.name) {
      setDraft(column.name);
      return;
    }
    startTransition(async () => {
      const res = await renameColumnAction(wsSlug, projectSlug, column.id, next);
      if (!res.ok) {
        toast.error(res.error);
        setDraft(column.name);
      }
    });
  }

  function onColorPick(color: LabelColorSlug) {
    startTransition(async () => {
      const res = await setColumnColorAction(wsSlug, projectSlug, column.id, color);
      if (!res.ok) toast.error(res.error);
    });
  }

  function onDelete() {
    if (!window.confirm(`Удалить колонку «${column.name}»?`)) return;
    startTransition(async () => {
      const res = await deleteColumnAction(wsSlug, projectSlug, column.id);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex h-full w-72 shrink-0 flex-col rounded-lg border border-border bg-card",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border p-2.5">
        <button
          type="button"
          className="touch-none rounded text-muted-foreground/60 hover:text-muted-foreground"
          aria-label="Перетащить колонку"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="block size-2 shrink-0 rounded-sm" style={{ background: bar }} aria-hidden />
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
                setDraft(column.name);
                setEditing(false);
              }
            }}
            className="h-7 flex-1 px-2 text-sm"
          />
        ) : (
          <button
            type="button"
            className="flex-1 truncate text-left text-sm font-medium"
            onClick={() => setEditing(true)}
          >
            {column.name}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label="Меню колонки"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 p-2">
            <DropdownMenuItem onSelect={() => setEditing(true)}>Переименовать</DropdownMenuItem>
            <div className="px-2 pb-1.5 pt-2">
              <ColorDots current={column.color} onPick={onColorPick} disabled={pending} />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} disabled={pending} variant="destructive">
              <Trash2 className="size-4" /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        ref={setBodyRef}
        className={cn(
          "flex-1 overflow-y-auto transition-colors",
          isOver && "bg-accent/40",
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-1.5 p-2">
            {tasks.map((t) => (
              <SortableTaskCard
                key={t.id}
                wsSlug={wsSlug}
                projectSlug={projectSlug}
                task={t}
              />
            ))}
            {tasks.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground/70">
                Перетащите задачу сюда
              </p>
            )}
          </div>
        </SortableContext>
      </div>
      <NewTaskForm wsSlug={wsSlug} projectSlug={projectSlug} columnId={column.id} />
    </div>
  );
}

function ColorDots({
  current,
  onPick,
  disabled,
}: {
  current: string;
  onPick: (slug: LabelColorSlug) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LABEL_COLORS.map((c) => (
        <button
          key={c.slug}
          type="button"
          disabled={disabled}
          onClick={() => onPick(c.slug)}
          className={cn(
            "flex size-4 items-center justify-center rounded-full ring-1 ring-inset ring-black/10 transition hover:scale-110 disabled:opacity-50",
            current === c.slug && "ring-2 ring-foreground/70",
          )}
          aria-label={c.label}
          title={c.label}
          style={{ background: c.hex }}
        >
          {current === c.slug && <Check className="size-2.5 text-white drop-shadow" />}
        </button>
      ))}
    </div>
  );
}

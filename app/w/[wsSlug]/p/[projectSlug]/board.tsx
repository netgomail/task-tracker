"use client";

import { useId, useMemo, useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { toast } from "sonner";

import { keyBetween } from "@/domain/ordering";
import { moveColumnAction } from "@/actions/columns";
import { moveTaskAction } from "@/actions/tasks";
import type { TaskPriority, TaskType } from "@/domain/types";

import { ColumnView } from "./column-view";
import { NewColumnForm } from "./new-column-form";
import { TaskCard } from "./task-card";
import { TaskDialog } from "./task-dialog";

export type BoardColumn = {
  id: string;
  name: string;
  color: string;
  orderKey: string;
};

export type BoardTask = {
  id: string;
  columnId: string;
  title: string;
  color: string;
  type: TaskType;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  orderKey: string;
};

type Props = {
  wsSlug: string;
  projectSlug: string;
  initialColumns: BoardColumn[];
  initialTasks: BoardTask[];
};

type Active =
  | { type: "column"; columnId: string }
  | { type: "task"; taskId: string }
  | null;

/**
 * Combined detector: prefer pointer for cards (fine-grained), fall back to
 * rect intersection so empty columns still receive drops.
 */
const detectCollisions: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return rectIntersection(args);
};

export function Board({ wsSlug, projectSlug, initialColumns, initialTasks }: Props) {
  const dndId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openTaskId = searchParams.get("task");

  function closeTaskDialog() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const [optimisticColumns, applyColumns] = useOptimistic(
    initialColumns,
    (_: BoardColumn[], next: BoardColumn[]) => next,
  );

  const [optimisticTasks, applyTasks] = useOptimistic(
    initialTasks,
    (_: BoardTask[], next: BoardTask[]) => next,
  );

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, BoardTask[]>();
    for (const c of optimisticColumns) map.set(c.id, []);
    for (const t of optimisticTasks) {
      const list = map.get(t.columnId) ?? [];
      list.push(t);
      map.set(t.columnId, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));
    return map;
  }, [optimisticColumns, optimisticTasks]);

  const [active, setActive] = useState<Active>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function findColumnIdFromOver(overId: string, overData: Record<string, unknown> | undefined): string | null {
    // Prefer explicit metadata on the droppable.
    if (overData?.columnId) return String(overData.columnId);
    if (overData?.type === "column") return overId;
    if (overData?.type === "task") return String(overData.columnId);
    // Last resort: overId may equal a column id (column-sortable).
    if (optimisticColumns.some((c) => c.id === overId)) return overId;
    return null;
  }

  function onDragStart(event: DragStartEvent) {
    const t = event.active.data.current?.type;
    if (t === "column") setActive({ type: "column", columnId: String(event.active.id) });
    else if (t === "task") setActive({ type: "task", taskId: String(event.active.id) });
    else setActive(null);
  }

  function onDragOver(event: DragOverEvent) {
    const { active: a, over } = event;
    if (!over) return;
    if (a.data.current?.type !== "task") return;

    const activeId = String(a.id);
    const overId = String(over.id);
    const sourceColumnId = String(a.data.current.columnId);
    const targetColumnId = findColumnIdFromOver(overId, over.data.current);
    if (!targetColumnId || sourceColumnId === targetColumnId) return;

    // Cross-column visual move during drag. useOptimistic requires a transition.
    const updated = optimisticTasks.map((t) =>
      t.id === activeId ? { ...t, columnId: targetColumnId } : t,
    );
    startTransition(() => {
      applyTasks(updated);
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active: a, over } = event;
    setActive(null);
    if (!over) return;

    const type = a.data.current?.type;

    if (type === "column") {
      if (a.id === over.id) return;
      const oldIdx = optimisticColumns.findIndex((c) => c.id === a.id);
      const newIdx = optimisticColumns.findIndex((c) => c.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return;
      const next = arrayMove(optimisticColumns, oldIdx, newIdx);
      const before = next[newIdx - 1]?.orderKey ?? null;
      const after = next[newIdx + 1]?.orderKey ?? null;
      const newKey = keyBetween(before, after);
      const optimisticNext = next.map((c, i) => (i === newIdx ? { ...c, orderKey: newKey } : c));
      startTransition(async () => {
        applyColumns(optimisticNext);
        const res = await moveColumnAction(
          wsSlug,
          projectSlug,
          String(a.id),
          before,
          after,
        );
        if (!res.ok) toast.error(res.error);
      });
      return;
    }

    if (type === "task") {
      const activeId = String(a.id);
      const overId = String(over.id);
      const targetColumnId = findColumnIdFromOver(overId, over.data.current);
      if (!targetColumnId) return;

      // IMPORTANT: compute the new position from the server-rendered state
      // (initialTasks), not from optimisticTasks. onDragOver may have already
      // shuffled the task into the target column visually, which would make
      // any same-state detection lie.
      const withoutMoved = initialTasks
        .filter((t) => t.columnId === targetColumnId && t.id !== activeId)
        .sort((x, y) => (x.orderKey < y.orderKey ? -1 : 1));

      let landingIndex = withoutMoved.length;
      if (over.data.current?.type === "task" && overId !== activeId) {
        const overIdx = withoutMoved.findIndex((t) => t.id === overId);
        if (overIdx >= 0) landingIndex = overIdx;
      }

      const before = withoutMoved[landingIndex - 1]?.orderKey ?? null;
      const after = withoutMoved[landingIndex]?.orderKey ?? null;
      const newKey = keyBetween(before, after);

      const optimisticNext = optimisticTasks.map((t) =>
        t.id === activeId ? { ...t, columnId: targetColumnId, orderKey: newKey } : t,
      );
      startTransition(async () => {
        applyTasks(optimisticNext);
        const res = await moveTaskAction(
          wsSlug,
          projectSlug,
          activeId,
          targetColumnId,
          before,
          after,
        );
        if (!res.ok) toast.error(res.error);
      });
    }
  }

  const activeTask =
    active?.type === "task" ? optimisticTasks.find((t) => t.id === active.taskId) ?? null : null;
  const activeColumn =
    active?.type === "column"
      ? optimisticColumns.find((c) => c.id === active.columnId) ?? null
      : null;

  return (
    <div className="flex flex-1 gap-3 overflow-x-auto overflow-y-hidden px-6 py-4">
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={detectCollisions}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={optimisticColumns.map((c) => c.id)}
          strategy={horizontalListSortingStrategy}
        >
          {optimisticColumns.map((c) => (
            <ColumnView
              key={c.id}
              wsSlug={wsSlug}
              projectSlug={projectSlug}
              column={c}
              tasks={tasksByColumn.get(c.id) ?? []}
            />
          ))}
        </SortableContext>
        <DragOverlay>
          {activeColumn ? (
            <div className="w-72 rounded-lg border border-border bg-card opacity-90 shadow-md">
              <div className="flex items-center gap-2 p-3">
                <span
                  className="block size-2 rounded-sm"
                  style={{ background: activeColumn.color }}
                />
                <span className="text-sm font-medium">{activeColumn.name}</span>
              </div>
            </div>
          ) : activeTask ? (
            <div className="w-[17rem] rotate-1 opacity-95 shadow-lg">
              <TaskCard wsSlug={wsSlug} projectSlug={projectSlug} task={activeTask} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <NewColumnForm wsSlug={wsSlug} projectSlug={projectSlug} />
      {openTaskId && (
        <TaskDialog
          wsSlug={wsSlug}
          projectSlug={projectSlug}
          taskId={openTaskId}
          onClose={closeTaskDialog}
        />
      )}
    </div>
  );
}

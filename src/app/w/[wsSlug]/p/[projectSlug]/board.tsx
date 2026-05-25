"use client";

import { useEffect, useId, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
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
} from "@dnd-kit/sortable";
import { toast } from "sonner";

import { keyBetween } from "@/domain/ordering";
import { moveColumnAction } from "@/actions/columns";
import { moveTaskAction } from "@/actions/tasks";
import type { TaskPriority, TaskType } from "@/domain/types";
import type { WorkspaceMember } from "@/services/membership";

import { BoardLiveSync } from "./board-live-sync";
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

export type BoardTaskLabel = {
  id: string;
  name: string;
  color: string;
};

export type BoardTaskAssignee = {
  id: string;
  name: string;
  image: string | null;
};

export type BoardTaskSubtask = {
  id: string;
  title: string;
  completed: boolean;
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
  labels: BoardTaskLabel[];
  assignee: BoardTaskAssignee | null;
  subtasks: BoardTaskSubtask[];
  subtasksDone: number;
};

type Props = {
  wsSlug: string;
  projectSlug: string;
  boardId: string;
  initialColumns: BoardColumn[];
  initialTasks: BoardTask[];
  members: WorkspaceMember[];
};

type Active =
  | { type: "column"; columnId: string }
  | { type: "task"; taskId: string }
  | null;

function compareTasksByOrder(a: BoardTask, b: BoardTask): number {
  if (a.orderKey === b.orderKey) return a.id.localeCompare(b.id);
  return a.orderKey < b.orderKey ? -1 : 1;
}

function isAfterOverItem(
  over: { rect: { top: number; height: number } },
  translatedRect: { top: number; height: number } | null,
): boolean {
  if (!translatedRect) return false;
  return translatedRect.top + translatedRect.height / 2 > over.rect.top + over.rect.height / 2;
}

function sameOrder(a: BoardTask[], b: BoardTask[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((task, index) => task.id === b[index]?.id);
}

/**
 * Combined detector: prefer pointer for cards (fine-grained), fall back to
 * rect intersection so empty columns still receive drops.
 */
const detectCollisions: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return rectIntersection(args);
};

export function Board({ wsSlug, projectSlug, boardId, initialColumns, initialTasks, members }: Props) {
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
  const [dragTasks, setDragTasks] = useState<BoardTask[] | null>(null);
  const visibleTasks = dragTasks ?? optimisticTasks;
  const visibleTasksRef = useRef(visibleTasks);

  useEffect(() => {
    visibleTasksRef.current = visibleTasks;
  }, [visibleTasks]);

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, BoardTask[]>();
    for (const c of optimisticColumns) map.set(c.id, []);
    for (const t of visibleTasks) {
      const list = map.get(t.columnId) ?? [];
      list.push(t);
      map.set(t.columnId, list);
    }
    for (const list of map.values()) list.sort(compareTasksByOrder);
    return map;
  }, [optimisticColumns, visibleTasks]);

  const [active, setActive] = useState<Active>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
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
    else if (t === "task") {
      setActive({ type: "task", taskId: String(event.active.id) });
      visibleTasksRef.current = optimisticTasks;
      setDragTasks(optimisticTasks);
    } else setActive(null);
  }

  function onDragCancel() {
    setActive(null);
    setDragTasks(null);
  }

  // Hybrid model:
  //   - onDragOver animates only within-column reorder (so neighbors visibly
  //     slide). Cross-column moves are NOT previewed — only the column under
  //     the pointer is highlighted via its own droppable's isOver.
  //   - onDragEnd resolves the final position from the `over` element at drop
  //     time. This avoids geometry breakage caused by virtually moving the
  //     task across columns mid-drag (the source of the "lands anywhere" bug).
  function onDragOver(event: DragOverEvent) {
    const { active: a, over } = event;
    if (!over) return;
    if (a.data.current?.type !== "task") return;
    if (over.data.current?.type !== "task") return;

    const activeId = String(a.id);
    const overId = String(over.id);
    if (overId === activeId) return;

    const sourceColumnId = a.data.current?.columnId;
    const overColumnId = over.data.current?.columnId;
    if (sourceColumnId !== overColumnId) return;
    if (typeof sourceColumnId !== "string") return;

    const currentTasks = visibleTasksRef.current;
    const activeTask = currentTasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    const targetTasks = currentTasks
      .filter((t) => t.columnId === sourceColumnId && t.id !== activeId)
      .sort(compareTasksByOrder);
    const overIdx = targetTasks.findIndex((t) => t.id === overId);
    if (overIdx < 0) return;
    const landingIndex =
      overIdx + (isAfterOverItem(over, a.rect.current.translated) ? 1 : 0);

    const before = targetTasks[landingIndex - 1]?.orderKey ?? null;
    const after = targetTasks[landingIndex]?.orderKey ?? null;
    const orderKey = keyBetween(before, after);
    if (activeTask.orderKey === orderKey) return;

    const updated = currentTasks.map((t) =>
      t.id === activeId ? { ...t, orderKey } : t,
    );
    visibleTasksRef.current = updated;
    setDragTasks(updated);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active: a, over } = event;
    setActive(null);
    if (!over) {
      setDragTasks(null);
      return;
    }

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
      const sourceColumnId = a.data.current?.columnId;
      if (typeof sourceColumnId !== "string") {
        setDragTasks(null);
        return;
      }
      const overId = String(over.id);
      const targetColumnId = findColumnIdFromOver(overId, over.data.current);
      if (!targetColumnId) {
        setDragTasks(null);
        return;
      }

      let before: string | null;
      let after: string | null;
      let noop = false;

      if (sourceColumnId === targetColumnId && over.data.current?.type === "task") {
        // Within-column reorder over a task — the preview already reflects the
        // final position (onDragOver updated it). Use it as source of truth.
        const previewColumnTasks = visibleTasksRef.current
          .filter((t) => t.columnId === targetColumnId)
          .sort(compareTasksByOrder);
        const committedColumnTasks = optimisticTasks
          .filter((t) => t.columnId === targetColumnId)
          .sort(compareTasksByOrder);
        if (sameOrder(committedColumnTasks, previewColumnTasks)) noop = true;
        const activeIdx = previewColumnTasks.findIndex((t) => t.id === activeId);
        if (activeIdx < 0) {
          setDragTasks(null);
          return;
        }
        before = activeIdx > 0 ? previewColumnTasks[activeIdx - 1].orderKey : null;
        after =
          activeIdx < previewColumnTasks.length - 1
            ? previewColumnTasks[activeIdx + 1].orderKey
            : null;
      } else {
        // Either:
        //   - within-column drop on column body → land at end of column
        //   - cross-column drop on a task → above/below that task
        //   - cross-column drop on column body → land at end of target column
        const targetTasks = optimisticTasks
          .filter((t) => t.columnId === targetColumnId && t.id !== activeId)
          .sort(compareTasksByOrder);
        let landingIndex: number;
        if (over.data.current?.type === "task") {
          const overIdx = targetTasks.findIndex((t) => t.id === overId);
          landingIndex =
            overIdx >= 0
              ? overIdx + (isAfterOverItem(over, a.rect.current.translated) ? 1 : 0)
              : targetTasks.length;
        } else {
          landingIndex = targetTasks.length;
        }
        before = targetTasks[landingIndex - 1]?.orderKey ?? null;
        after = targetTasks[landingIndex]?.orderKey ?? null;

        if (sourceColumnId === targetColumnId) {
          const sourceList = optimisticTasks
            .filter((t) => t.columnId === sourceColumnId)
            .sort(compareTasksByOrder);
          const currentIdx = sourceList.findIndex((t) => t.id === activeId);
          if (currentIdx === landingIndex) noop = true;
        }
      }

      if (noop) {
        setDragTasks(null);
        return;
      }

      const newKey = keyBetween(before, after);
      const optimisticNext = optimisticTasks.map((t) =>
        t.id === activeId ? { ...t, columnId: targetColumnId, orderKey: newKey } : t,
      );
      visibleTasksRef.current = optimisticNext;
      setDragTasks(optimisticNext);
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
        setDragTasks(null);
      });
      return;
    }

    setDragTasks(null);
  }

  const activeTask =
    active?.type === "task" ? visibleTasks.find((t) => t.id === active.taskId) ?? null : null;
  const activeColumn =
    active?.type === "column"
      ? optimisticColumns.find((c) => c.id === active.columnId) ?? null
      : null;

  const hasFilters =
    searchParams.get("q") !== null ||
    searchParams.get("priority") !== null ||
    searchParams.get("label") !== null ||
    searchParams.get("assignee") !== null;
  const noResults =
    hasFilters && optimisticColumns.length > 0 && visibleTasks.length === 0;

  function clearFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("priority");
    params.delete("label");
    params.delete("assignee");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BoardLiveSync boardId={boardId} />
      {noResults && (
        <div className="mx-6 mt-3 flex items-center justify-between gap-3 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Под текущие фильтры не попало ни одной задачи.
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="font-medium text-foreground hover:underline"
          >
            Сбросить фильтры
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden px-6 py-4">
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={detectCollisions}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
        {optimisticColumns.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex max-w-sm flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm font-medium">В проекте пока нет колонок</p>
              <p className="text-xs text-muted-foreground">
                Создайте первую колонку справа, чтобы начать заводить задачи.
              </p>
            </div>
          </div>
        ) : (
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
                members={members}
              />
            ))}
          </SortableContext>
        )}
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
    </div>
  );
}

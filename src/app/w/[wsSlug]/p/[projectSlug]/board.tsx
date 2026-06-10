"use client";

import { useEffect, useId, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { toast } from "sonner";

import { keyBetween } from "@/domain/ordering";
import { moveColumnAction } from "@/actions/columns";
import { moveTaskAction } from "@/actions/tasks";
import type { TaskPriority, TaskType } from "@/domain/types";
import type { WorkspaceMember } from "@/services/membership";

import { BoardLiveSync } from "./board-live-sync";
import { ColumnView } from "./column-view";
import { NewColumnForm } from "./new-column-form";
import type { NewTaskTemplate } from "./new-task-form";
import { TaskCard } from "./task-card";
import { TaskDialog } from "./task-dialog";

export type BoardColumn = {
  id: string;
  name: string;
  color: string;
  orderKey: string;
  wipLimit: number | null;
};

export type BoardTaskLabel = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
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
  description: string | null;
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
  commentsCount: number;
  attachmentsCount: number;
  reviewAt: string | null;
  linksDone: number;
  linksTotal: number;
  obsidianPath: string | null;
};

type Props = {
  wsSlug: string;
  projectSlug: string;
  boardId: string;
  initialColumns: BoardColumn[];
  initialTasks: BoardTask[];
  members: WorkspaceMember[];
  templates: NewTaskTemplate[];
};

type Active =
  | { type: "column"; columnId: string }
  | { type: "task"; taskId: string }
  | null;

function compareTasksByOrder(a: BoardTask, b: BoardTask): number {
  if (a.orderKey === b.orderKey) return a.id.localeCompare(b.id);
  return a.orderKey < b.orderKey ? -1 : 1;
}

/**
 * Текущая Y-координата указателя. Решение «выше/ниже целевой карточки»
 * принимается по той же точке, по которой `pointerWithin` выбирает цель, —
 * иначе позиция зависит от того, за какое место схватили карточку.
 */
function pointerYOf(event: { activatorEvent: Event; delta: { y: number } }): number | null {
  const coords = getEventCoordinates(event.activatorEvent);
  return coords ? coords.y + event.delta.y : null;
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

export function Board({ wsSlug, projectSlug, boardId, initialColumns, initialTasks, members, templates }: Props) {
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

  type Placement = {
    tasks: BoardTask[];
    changed: boolean;
    targetColumnId: string;
    beforeTaskId: string | null;
    afterTaskId: string | null;
  };

  // Единая модель: и превью (onDragOver), и финальная позиция (onDragEnd)
  // считаются одной функцией — что видишь во время drag, то и фиксируется.
  // Позиция определяется указателем: над верхней половиной карточки — перед
  // ней, над нижней — после; над телом колонки (зазор, низ списка) — в конец.
  function placeTask(
    current: BoardTask[],
    activeId: string,
    over: Over,
    pointerY: number | null,
  ): Placement | null {
    const overId = String(over.id);
    const targetColumnId = findColumnIdFromOver(overId, over.data.current);
    if (!targetColumnId) return null;
    const activeTask = current.find((t) => t.id === activeId);
    if (!activeTask) return null;

    // «Остаться на месте»: соседи активной задачи в её текущей колонке.
    const keep = (): Placement => {
      const colList = current
        .filter((t) => t.columnId === activeTask.columnId)
        .sort(compareTasksByOrder);
      const idx = colList.findIndex((t) => t.id === activeId);
      return {
        tasks: current,
        changed: false,
        targetColumnId: activeTask.columnId,
        beforeTaskId: colList[idx - 1]?.id ?? null,
        afterTaskId: colList[idx + 1]?.id ?? null,
      };
    };
    // Курсор над самой перетаскиваемой карточкой — позиция не меняется.
    if (over.data.current?.type === "task" && overId === activeId) return keep();
    // Курсор над телом СВОЕЙ колонки (зазор между карточками, край списка) —
    // не трактуем как «в конец», иначе карточка дёргается при каждом зазоре.
    if (over.data.current?.type !== "task" && activeTask.columnId === targetColumnId) {
      return keep();
    }

    const others = current
      .filter((t) => t.columnId === targetColumnId && t.id !== activeId)
      .sort(compareTasksByOrder);

    let landing = others.length;
    if (over.data.current?.type === "task" && overId !== activeId) {
      const overIdx = others.findIndex((t) => t.id === overId);
      if (overIdx < 0) return null;
      const below = pointerY !== null && pointerY > over.rect.top + over.rect.height / 2;
      landing = overIdx + (below ? 1 : 0);
    }

    const beforeTask = others[landing - 1] ?? null;
    const afterTask = others[landing] ?? null;

    // Уже между этими соседями — не двигаем (это же гасит дрожание превью).
    const inPlace =
      activeTask.columnId === targetColumnId &&
      (beforeTask === null || beforeTask.orderKey < activeTask.orderKey) &&
      (afterTask === null || activeTask.orderKey < afterTask.orderKey);
    if (inPlace) {
      return {
        tasks: current,
        changed: false,
        targetColumnId,
        beforeTaskId: beforeTask?.id ?? null,
        afterTaskId: afterTask?.id ?? null,
      };
    }

    let orderKey: string;
    try {
      orderKey = keyBetween(beforeTask?.orderKey ?? null, afterTask?.orderKey ?? null);
    } catch {
      // Дегенеративные данные (равные ключи соседей) — позицию не трогаем.
      return null;
    }
    return {
      tasks: current.map((t) =>
        t.id === activeId ? { ...t, columnId: targetColumnId, orderKey } : t,
      ),
      changed: true,
      targetColumnId,
      beforeTaskId: beforeTask?.id ?? null,
      afterTaskId: afterTask?.id ?? null,
    };
  }

  function onDragOver(event: DragOverEvent) {
    const { active: a, over } = event;
    if (!over || a.data.current?.type !== "task") return;
    const placed = placeTask(visibleTasksRef.current, String(a.id), over, pointerYOf(event));
    if (!placed?.changed) return;
    visibleTasksRef.current = placed.tasks;
    setDragTasks(placed.tasks);
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
      // Последняя корректировка по точке броска (превью её обычно уже учло).
      const placed = placeTask(visibleTasksRef.current, activeId, over, pointerYOf(event));
      if (!placed) {
        setDragTasks(null);
        return;
      }
      const finalTasks = placed.tasks;

      // Порядок целевой колонки не изменился относительно закоммиченного —
      // сервер не дёргаем (бросили туда же, откуда взяли).
      const committedActive = optimisticTasks.find((t) => t.id === activeId);
      const columnTasks = (list: BoardTask[]) =>
        list.filter((t) => t.columnId === placed.targetColumnId).sort(compareTasksByOrder);
      if (
        committedActive?.columnId === placed.targetColumnId &&
        sameOrder(columnTasks(optimisticTasks), columnTasks(finalTasks))
      ) {
        setDragTasks(null);
        return;
      }

      visibleTasksRef.current = finalTasks;
      setDragTasks(finalTasks);
      startTransition(async () => {
        applyTasks(finalTasks);
        try {
          const res = await moveTaskAction(
            wsSlug,
            projectSlug,
            activeId,
            placed.targetColumnId,
            placed.beforeTaskId,
            placed.afterTaskId,
          );
          if (!res.ok) toast.error(res.error);
        } catch {
          toast.error("Не удалось переместить задачу — обновите доску");
        } finally {
          setDragTasks(null);
        }
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
        // Превью двигает карточки между колонками прямо во время drag —
        // прямоугольники droppable-зон надо перемерять, иначе прицел собьётся.
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
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
                templates={templates}
              />
            ))}
          </SortableContext>
        )}
        <DragOverlay>
          {activeColumn ? (
            <div className="w-80 rounded-lg border border-border bg-card opacity-90 shadow-md">
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

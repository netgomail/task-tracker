"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";

import { cn } from "@/lib/utils";

import { TaskCard } from "./task-card";
import type { BoardTask } from "./board";

type Props = {
  wsSlug: string;
  projectSlug: string;
  task: BoardTask;
};

export function SortableTaskCard({ wsSlug, projectSlug, task }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", columnId: task.columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("touch-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <TaskCard wsSlug={wsSlug} projectSlug={projectSlug} task={task} />
    </div>
  );
}

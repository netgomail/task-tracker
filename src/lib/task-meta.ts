import {
  Bug,
  CheckSquare,
  Wrench,
  Sparkles,
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Minus,
  type LucideIcon,
} from "lucide-react";

import type { TaskPriority, TaskType } from "@/domain/types";

export const TASK_TYPE_META: Record<TaskType, { label: string; Icon: LucideIcon }> = {
  task: { label: "Задача", Icon: CheckSquare },
  bug: { label: "Баг", Icon: Bug },
  feature: { label: "Фича", Icon: Sparkles },
  chore: { label: "Рутина", Icon: Wrench },
};

export const TASK_PRIORITY_META: Record<
  TaskPriority,
  { label: string; Icon: LucideIcon; tone: "muted" | "neutral" | "warn" | "danger" }
> = {
  low: { label: "Низкий", Icon: ArrowDown, tone: "muted" },
  normal: { label: "Обычный", Icon: Minus, tone: "neutral" },
  high: { label: "Высокий", Icon: ArrowUp, tone: "warn" },
  urgent: { label: "Срочно", Icon: AlertTriangle, tone: "danger" },
};

export const PRIORITY_TONE_CLASSES: Record<
  "muted" | "neutral" | "warn" | "danger",
  string
> = {
  muted: "text-muted-foreground/70",
  neutral: "text-muted-foreground",
  warn: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
};

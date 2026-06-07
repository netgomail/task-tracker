import {
  ScrollText,
  BookText,
  BookMarked,
  ShieldCheck,
  CalendarDays,
  NotebookPen,
  ListChecks,
  FileSignature,
  IdCard,
  FileCheck,
  ShieldAlert,
  FileText,
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Minus,
  type LucideIcon,
} from "lucide-react";

import type { TaskLinkType, TaskPriority, TaskType } from "@/domain/types";

/** Тон бейджа типа документа — используется в чипах на карточке/в таблице. */
export type TypeTone = "slate" | "blue" | "violet" | "amber" | "green" | "rose" | "cyan";

export const TYPE_TONE_CLASSES: Record<TypeTone, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
};

export const TASK_TYPE_META: Record<TaskType, { label: string; short: string; Icon: LucideIcon; tone: TypeTone }> = {
  order: { label: "Приказ", short: "Приказ", Icon: ScrollText, tone: "blue" },
  instruction: { label: "Инструкция", short: "Инстр.", Icon: BookText, tone: "violet" },
  regulation: { label: "Положение / Правила", short: "Положение", Icon: BookMarked, tone: "cyan" },
  policy: { label: "Политика", short: "Политика", Icon: ShieldCheck, tone: "green" },
  plan: { label: "План", short: "План", Icon: CalendarDays, tone: "amber" },
  journal: { label: "Журнал", short: "Журнал", Icon: NotebookPen, tone: "slate" },
  list: { label: "Перечень", short: "Перечень", Icon: ListChecks, tone: "slate" },
  consent: { label: "Согласие", short: "Согласие", Icon: FileSignature, tone: "rose" },
  job_description: { label: "Должностная инструкция", short: "Должн.", Icon: IdCard, tone: "violet" },
  act: { label: "Акт", short: "Акт", Icon: FileCheck, tone: "green" },
  model: { label: "Модель угроз", short: "Модель", Icon: ShieldAlert, tone: "rose" },
  other: { label: "Форма / Иное", short: "Иное", Icon: FileText, tone: "slate" },
};

/**
 * Метаданные типов связей. forward — формулировка от source к target,
 * reverse — обратная (как видит её target).
 */
export const TASK_LINK_META: Record<TaskLinkType, { forward: string; reverse: string }> = {
  requires: { forward: "требует", reverse: "требуется для" },
  approves: { forward: "утверждает", reverse: "утверждается" },
  complements: { forward: "дополняется", reverse: "дополняет" },
  relates: { forward: "связан с", reverse: "связан с" },
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

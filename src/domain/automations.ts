// Чистые типы и схемы для автоматизаций — без `server-only`, чтобы
// client-компоненты редактора могли импортировать без подтягивания db.

import { z } from "zod";

import { TASK_PRIORITIES } from "./types";

// ── Триггеры ────────────────────────────────────────────────────────────────

export const TRIGGER_TYPES = ["task.created", "task.moved", "task.label_added"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  "task.created": "Задача создана",
  "task.moved": "Задача перемещена",
  "task.label_added": "К задаче добавлена метка",
};

// Параметры триггеров: для task.moved — конкретная to-колонка (опц.),
// для label_added — конкретная метка (опц.).
export const TriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.created"), params: z.object({}).strict() }),
  z.object({
    type: z.literal("task.moved"),
    params: z.object({ toColumnId: z.string().min(1).optional() }),
  }),
  z.object({
    type: z.literal("task.label_added"),
    params: z.object({ labelId: z.string().min(1).optional() }),
  }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;

// ── Условия ─────────────────────────────────────────────────────────────────

export const CONDITION_KEYS = ["column", "priority", "has_label", "assignee"] as const;
export type ConditionKey = (typeof CONDITION_KEYS)[number];

export const CONDITION_LABEL: Record<ConditionKey, string> = {
  column: "Колонка",
  priority: "Приоритет",
  has_label: "Есть метка",
  assignee: "Исполнитель",
};

export const ConditionSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("column"), value: z.string().min(1) }),
  z.object({ key: z.literal("priority"), value: z.enum(TASK_PRIORITIES) }),
  z.object({ key: z.literal("has_label"), value: z.string().min(1) }),
  // value: userId | "none" (без исполнителя)
  z.object({ key: z.literal("assignee"), value: z.string().min(1) }),
]);
export type Condition = z.infer<typeof ConditionSchema>;

// ── Действия ────────────────────────────────────────────────────────────────

export const ACTION_TYPES = [
  "set_priority",
  "set_color",
  "add_label",
  "assign_to",
  "move_to_column",
  "mark_complete",
  "add_comment",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_LABEL: Record<ActionType, string> = {
  set_priority: "Установить приоритет",
  set_color: "Установить цвет",
  add_label: "Добавить метку",
  assign_to: "Назначить исполнителя",
  move_to_column: "Переместить в колонку",
  mark_complete: "Отметить выполненной",
  add_comment: "Добавить комментарий",
};

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_priority"), params: z.object({ priority: z.enum(TASK_PRIORITIES) }) }),
  z.object({ type: z.literal("set_color"), params: z.object({ color: z.string().min(1) }) }),
  z.object({ type: z.literal("add_label"), params: z.object({ labelId: z.string().min(1) }) }),
  z.object({ type: z.literal("assign_to"), params: z.object({ userId: z.string().min(1) }) }),
  z.object({ type: z.literal("move_to_column"), params: z.object({ columnId: z.string().min(1) }) }),
  z.object({ type: z.literal("mark_complete"), params: z.object({}).strict() }),
  z.object({ type: z.literal("add_comment"), params: z.object({ text: z.string().min(1).max(500) }) }),
]);
export type AutomationAction = z.infer<typeof ActionSchema>;

// ── Полное правило ───────────────────────────────────────────────────────────

export const RuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  trigger: TriggerSchema,
  conditions: z.array(ConditionSchema),
  actions: z.array(ActionSchema).min(1),
});
export type Rule = z.infer<typeof RuleSchema>;

// Сохранённое правило (без зашитых параметров, как приходит из БД).
export type AutomationRow = {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: AutomationAction[];
  createdAt: Date;
  updatedAt: Date;
};

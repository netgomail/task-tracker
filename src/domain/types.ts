// Доменные литералы для задач. Сейчас они хранятся как TEXT в SQLite с CHECK-констрейнтами.
// Когда понадобятся пользовательские типы/приоритеты — переведём в таблицы task_types/priorities,
// сохранив этот же набор как «стандартные пресеты». См. PLAN.md §4.2.
export const TASK_TYPES = ["task", "bug", "feature", "chore"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const MEMBERSHIP_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

// Доменные литералы для задач. Хранятся как TEXT в Postgres с CHECK-констрейнтами.

// Типовые типы задач (универсальный таск-менеджер). Доменная классификация
// живёт в МЕТКАХ воркспейса, а не здесь.
export const TASK_TYPES = ["task", "bug", "feature", "chore"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// Типы связей между задачами. См. db/schema/task-links.ts.
export const TASK_LINK_TYPES = ["requires", "approves", "complements", "relates"] as const;
export type TaskLinkType = (typeof TASK_LINK_TYPES)[number];

export const MEMBERSHIP_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

// Доменные литералы для задач. Хранятся как TEXT в Postgres с CHECK-констрейнтами.

// Типы документов ОРД (организационно-распорядительная документация по ИБ/ПДн).
// Поле tasks.type. Метаданные (ярлык/цвет/иконка) — в TASK_TYPE_META (UI-слой).
export const TASK_TYPES = [
  "order", // Приказ
  "instruction", // Инструкция
  "regulation", // Положение / Правила
  "policy", // Политика
  "plan", // План
  "journal", // Журнал
  "list", // Перечень
  "consent", // Согласие
  "job_description", // Должностная инструкция
  "act", // Акт
  "model", // Модель угроз
  "other", // Форма / Иное
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// Типы связей между документами (комплектность). См. db/schema/task-links.ts.
export const TASK_LINK_TYPES = ["requires", "approves", "complements", "relates"] as const;
export type TaskLinkType = (typeof TASK_LINK_TYPES)[number];

export const MEMBERSHIP_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

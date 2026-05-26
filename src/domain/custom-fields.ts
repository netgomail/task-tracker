// Чистые типы и константы для кастомных полей — без `server-only`, чтобы
// клиентские компоненты (fields-editor, task-custom-fields) могли их
// импортировать без затаскивания db/server-кода в bundle.

export const FIELD_TYPES = ["text", "number", "select", "date", "url", "checkbox"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type SelectOption = { value: string; label: string };

export type FieldDef = {
  id: string;
  projectId: string;
  name: string;
  type: FieldType;
  options: SelectOption[];
  required: boolean;
  orderKey: string;
};

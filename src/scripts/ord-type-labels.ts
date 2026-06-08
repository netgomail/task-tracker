/**
 * Сопоставление прежних типов документов ОРД → метка (name/color/icon).
 * Тип документа теперь хранится как МЕТКА воркспейса, а не в tasks.type.
 * Ключ — прежнее значение tasks.type из доменной модели ОРД.
 */
export const ORD_TYPE_LABELS: Record<string, { name: string; color: string; icon: string }> = {
  order: { name: "Приказ", color: "blue", icon: "ScrollText" },
  instruction: { name: "Инструкция", color: "violet", icon: "BookText" },
  regulation: { name: "Положение / Правила", color: "cyan", icon: "BookMarked" },
  policy: { name: "Политика", color: "green", icon: "ShieldCheck" },
  plan: { name: "План", color: "amber", icon: "CalendarDays" },
  journal: { name: "Журнал", color: "slate", icon: "NotebookPen" },
  list: { name: "Перечень", color: "gray", icon: "ListChecks" },
  consent: { name: "Согласие", color: "pink", icon: "FileSignature" },
  job_description: { name: "Должностная инструкция", color: "violet", icon: "IdCard" },
  act: { name: "Акт", color: "green", icon: "FileCheck" },
  model: { name: "Модель угроз", color: "red", icon: "ShieldAlert" },
  other: { name: "Иное", color: "slate", icon: "FileText" },
};

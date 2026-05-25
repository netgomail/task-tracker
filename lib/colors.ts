// Палитра для колонок, задач и меток. Источник правды: эта таблица.
// Каждый цвет — отдельный slug, сохраняется в БД как TEXT.
// Hex/OKLCh используются на клиенте для предпросмотра; токенизированные классы — для UI.
export const LABEL_COLORS = [
  { slug: "slate", label: "Серый", hex: "#64748b" },
  { slug: "gray", label: "Графит", hex: "#6b7280" },
  { slug: "red", label: "Красный", hex: "#ef4444" },
  { slug: "orange", label: "Оранжевый", hex: "#f97316" },
  { slug: "amber", label: "Янтарный", hex: "#f59e0b" },
  { slug: "green", label: "Зелёный", hex: "#10b981" },
  { slug: "teal", label: "Бирюзовый", hex: "#14b8a6" },
  { slug: "cyan", label: "Голубой", hex: "#06b6d4" },
  { slug: "blue", label: "Синий", hex: "#3b82f6" },
  { slug: "violet", label: "Фиолетовый", hex: "#8b5cf6" },
  { slug: "pink", label: "Розовый", hex: "#ec4899" },
] as const;

export type LabelColorSlug = (typeof LABEL_COLORS)[number]["slug"];

const COLOR_MAP = new Map<string, (typeof LABEL_COLORS)[number]>(
  LABEL_COLORS.map((c) => [c.slug, c]),
);

export function isLabelColor(value: string): value is LabelColorSlug {
  return COLOR_MAP.has(value);
}

export function colorHex(slug: LabelColorSlug): string {
  return COLOR_MAP.get(slug)!.hex;
}

/**
 * "slate" — это «без цвета» / дефолт: рендерим как белый фон + нейтральный
 * бордер. При выборе любого другого цвета колонка/карточка получает тинт.
 */
export const DEFAULT_COLOR: LabelColorSlug = "slate";
export const DEFAULT_COLOR_LABEL = "Белый";
export const DEFAULT_COLOR_SWATCH = "#ffffff";

export function isDefaultColor(value: string): boolean {
  return value === DEFAULT_COLOR;
}

export function colorSwatchHex(slug: LabelColorSlug): string {
  return isDefaultColor(slug) ? DEFAULT_COLOR_SWATCH : colorHex(slug);
}

export function colorSwatchLabel(slug: LabelColorSlug): string {
  return isDefaultColor(slug) ? DEFAULT_COLOR_LABEL : COLOR_MAP.get(slug)!.label;
}

export const DEFAULT_COLUMN_COLORS = [
  "slate",
  "slate",
  "slate",
] as const satisfies readonly LabelColorSlug[];

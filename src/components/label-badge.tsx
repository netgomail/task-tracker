import { LABEL_ICONS } from "@/lib/label-icons";
import { cn } from "@/lib/utils";

export type LabelBadgeData = {
  name: string;
  color: string;
  icon?: string | null;
};

/**
 * Тон бейджа по цвету метки — те же заливки, что были у бейджей типов
 * (bg-100/text-700 + тёмная тема). Классы статичные ради Tailwind JIT.
 */
const TONE: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  pink: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
};

/**
 * Чип метки: залит цветом метки, с иконкой (если выбрана) и названием.
 * Единый вид во всех местах (карточка, диалог, таблица, фильтры, список задач).
 */
export function LabelBadge({
  label,
  className,
}: {
  label: LabelBadgeData;
  className?: string;
}) {
  const tone = TONE[label.color] ?? TONE.slate;
  const Icon = label.icon ? (LABEL_ICONS[label.icon] ?? null) : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
        tone,
        className,
      )}
    >
      {Icon && <Icon className="size-3 shrink-0" />}
      {label.name}
    </span>
  );
}

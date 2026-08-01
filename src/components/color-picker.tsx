"use client";

import { Check } from "lucide-react";

import {
  LABEL_COLORS,
  colorSwatchHex,
  colorSwatchLabel,
  isDefaultColor,
  type LabelColorSlug,
} from "@/lib/colors";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: { btn: "size-4", icon: "size-2.5" },
  md: { btn: "size-5", icon: "size-3" },
  lg: { btn: "size-6", icon: "size-3.5" },
  xl: { btn: "size-7", icon: "size-4" },
} as const;

type Props = {
  value: string;
  onPick: (slug: LabelColorSlug) => void;
  disabled?: boolean;
  size?: keyof typeof SIZE;
  /**
   * true — slate рендерится как «белый / без цвета» (карточки задач, колонки:
   * там slate означает дефолт). false — как обычный серый (метки, шаблоны,
   * автоматизации, где slate — полноценный цвет).
   */
  blankDefault?: boolean;
};

/** Единый пикер палитры LABEL_COLORS — вместо 7 локальных копий этой сетки. */
export function ColorPicker({
  value,
  onPick,
  disabled = false,
  size = "md",
  blankDefault = false,
}: Props) {
  const s = SIZE[size];
  return (
    <div className="flex flex-wrap gap-1.5">
      {LABEL_COLORS.map((c) => {
        const selected = value === c.slug;
        return (
          <button
            key={c.slug}
            type="button"
            disabled={disabled}
            onClick={() => onPick(c.slug)}
            className={cn(
              s.btn,
              "flex items-center justify-center rounded-full ring-1 ring-black/10 transition ring-inset hover:scale-110 disabled:opacity-50",
              selected && "ring-2 ring-foreground/70",
            )}
            style={{ background: blankDefault ? colorSwatchHex(c.slug) : c.hex }}
            aria-label={blankDefault ? colorSwatchLabel(c.slug) : c.label}
            title={blankDefault ? colorSwatchLabel(c.slug) : c.label}
          >
            {selected && (
              <Check
                className={cn(
                  s.icon,
                  "drop-shadow",
                  blankDefault && isDefaultColor(c.slug) ? "text-zinc-900" : "text-white",
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

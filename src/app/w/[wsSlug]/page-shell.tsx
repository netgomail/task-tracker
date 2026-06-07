import type { ReactNode } from "react";

/**
 * Единый каркас страниц раздела воркспейса (главная, архив, отчёты,
 * готовность, реестр…): собственный вертикальный скролл внутри фикс-высоты
 * layout-а, центрирование и одинаковые ширина/отступы.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">{children}</div>
    </div>
  );
}

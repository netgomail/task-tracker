"use client";

import { useEffect, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Rows3 } from "lucide-react";

import { cn } from "@/lib/utils";

export type ViewMode = "board" | "table";

const STORAGE_KEY_PREFIX = "tt:view:";

export function ViewToggle({
  projectSlug,
  current,
}: {
  projectSlug: string;
  current: ViewMode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // На первом маунте — если URL без ?view, берём предпочтение из localStorage
  // и перенаправляем; так пользователь, открывший проект с другого устройства,
  // получит свой предпочитаемый режим. eslint-disable: setState в effect это
  // канонический случай fetch-on-mount.
  useEffect(() => {
    if (searchParams.has("view")) return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY_PREFIX + projectSlug);
      if (saved === "table" || saved === "board") {
        const next = new URLSearchParams(searchParams.toString());
        next.set("view", saved);
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }
    } catch {
      // localStorage недоступен — игнорим
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSlug]);

  function pick(view: ViewMode) {
    try {
      window.localStorage.setItem(STORAGE_KEY_PREFIX + projectSlug, view);
    } catch {
      // ignore
    }
    const next = new URLSearchParams(searchParams.toString());
    if (view === "board") next.delete("view");
    else next.set("view", view);
    // При смене вида не имеет смысла сохранять сортировку из таблицы
    if (view === "board") {
      next.delete("sort");
      next.delete("dir");
    }
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <div
      className="inline-flex h-8 items-center rounded-md border border-border bg-background p-0.5"
      role="group"
      aria-label="Вид"
    >
      <button
        type="button"
        onClick={() => pick("board")}
        aria-pressed={current === "board"}
        title="Доска"
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs",
          current === "board"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="size-3.5" />
        Доска
      </button>
      <button
        type="button"
        onClick={() => pick("table")}
        aria-pressed={current === "table"}
        title="Таблица"
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs",
          current === "table"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Rows3 className="size-3.5" />
        Таблица
      </button>
    </div>
  );
}

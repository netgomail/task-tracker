"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: Array<{ keys: string; desc: string }> = [
  { keys: "c", desc: "Новая задача (фокус на первой колонке)" },
  { keys: "g p", desc: "Перейти к проектам" },
  { keys: "?", desc: "Показать список шорткатов" },
];

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

type Props = {
  wsSlug: string;
};

export function Hotkeys({ wsSlug }: Props) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  // Простейшая поддержка sequence g→<key>: запоминаем «g нажато» с таймаутом 1с.
  const gAt = useRef<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextInput(document.activeElement)) return;

      const now = Date.now();
      const gPressed = gAt.current !== null && now - gAt.current < 1000;

      if (gPressed) {
        gAt.current = null;
        if (e.key === "p") {
          e.preventDefault();
          router.push(`/w/${wsSlug}`);
          return;
        }
        // Любой другой ключ — сбрасываем sequence и обрабатываем как обычный.
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "g") {
        gAt.current = now;
        return;
      }
      if (e.key === "c") {
        const target = document.querySelector<HTMLElement>("[data-board-newtask]");
        if (!target) return;
        e.preventDefault();
        target.click();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, wsSlug]);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent>
        <DialogTitle>Клавиатурные шорткаты</DialogTitle>
        <DialogDescription className="sr-only">
          Полезные сочетания клавиш для быстрой навигации и работы с задачами.
        </DialogDescription>
        <ul className="flex flex-col gap-2 text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-baseline justify-between gap-4">
              <span className="text-muted-foreground">{s.desc}</span>
              <span className="flex gap-1">
                {s.keys.split(" ").map((k) => (
                  <kbd
                    key={k}
                    className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

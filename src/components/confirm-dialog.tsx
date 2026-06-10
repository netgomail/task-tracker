"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmOptions = {
  title: string;
  /** Подробности: что именно будет затронуто и чем это грозит. */
  description?: string;
  /** Подпись кнопки подтверждения. По умолчанию «Удалить». */
  confirmLabel?: string;
  cancelLabel?: string;
  /** false — обычная кнопка вместо деструктивной (для неопасных подтверждений). */
  destructive?: boolean;
};

type Pending = { opts: ConfirmOptions; resolve: (ok: boolean) => void };

let enqueue: ((p: Pending) => void) | null = null;

/**
 * Замена window.confirm: стилизованный диалог подтверждения.
 *
 *   if (!(await confirmDialog({ title: "Удалить задачу?", description: name }))) return;
 *
 * Требует смонтированного <ConfirmDialogHost/> (корневой layout); без него
 * откатывается на window.confirm.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (!enqueue) {
    const text = opts.description ? `${opts.title}\n\n${opts.description}` : opts.title;
    return Promise.resolve(window.confirm(text));
  }
  return new Promise((resolve) => enqueue!({ opts, resolve }));
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    enqueue = (p) => {
      setPending((prev) => {
        // Новый запрос отменяет висящий (на практике их не бывает двух).
        prev?.resolve(false);
        return p;
      });
    };
    return () => {
      enqueue = null;
    };
  }, []);

  function close(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  const opts = pending?.opts;
  return (
    <Dialog open={pending !== null} onOpenChange={(o) => !o && close(false)}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogTitle>{opts?.title}</DialogTitle>
        {opts?.description ? (
          <DialogDescription className="whitespace-pre-wrap">
            {opts.description}
          </DialogDescription>
        ) : (
          <DialogDescription className="sr-only">Подтверждение действия</DialogDescription>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            {opts?.cancelLabel ?? "Отмена"}
          </Button>
          <Button
            autoFocus
            variant={opts?.destructive === false ? "default" : "destructive"}
            onClick={() => close(true)}
          >
            {opts?.confirmLabel ?? "Удалить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createColumnAction } from "@/actions/columns";
import { DEFAULT_COLOR } from "@/lib/colors";

export function NewColumnForm({
  wsSlug,
  projectSlug,
}: {
  wsSlug: string;
  projectSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const next = name.trim();
    if (!next) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", next);
      fd.set("color", DEFAULT_COLOR);
      const res = await createColumnAction(wsSlug, projectSlug, fd);
      if (!res.ok) toast.error(res.error);
      else {
        setName("");
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-80 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="size-4" /> Добавить колонку
      </button>
    );
  }

  return (
    <div className="flex h-12 w-80 shrink-0 items-center gap-2 rounded-lg border border-border bg-card p-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
        placeholder="Название"
        className="h-8 flex-1"
      />
      <Button size="sm" onClick={submit} disabled={pending}>
        {pending ? "…" : "OK"}
      </Button>
    </div>
  );
}

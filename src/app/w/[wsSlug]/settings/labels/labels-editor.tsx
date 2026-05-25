"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { LABEL_COLORS, type LabelColorSlug } from "@/lib/colors";
import type { LabelRow } from "@/services/labels";
import {
  createLabelAction,
  deleteLabelAction,
  renameLabelAction,
  setLabelColorAction,
} from "@/actions/labels";

type Props = {
  wsSlug: string;
  initialLabels: LabelRow[];
};

export function LabelsEditor({ wsSlug, initialLabels }: Props) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColorSlug>("blue");

  function submitCreate() {
    const next = name.trim();
    if (!next) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", next);
      fd.set("color", color);
      const res = await createLabelAction(wsSlug, fd);
      if (!res.ok) toast.error(res.error);
      else {
        setName("");
        toast.success("Метка создана");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-end gap-2 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-1 flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="label-name">
            Новая метка
          </label>
          <div className="flex items-center gap-2">
            <ColorPicker value={color} onChange={setColor} disabled={pending} />
            <Input
              id="label-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitCreate();
                }
              }}
              placeholder="Например, frontend"
              maxLength={40}
              disabled={pending}
            />
          </div>
        </div>
        <Button onClick={submitCreate} disabled={pending || !name.trim()}>
          <Plus className="size-4" /> Добавить
        </Button>
      </section>

      {initialLabels.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Пока нет ни одной метки.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {initialLabels.map((l) => (
            <LabelRowView key={l.id} wsSlug={wsSlug} label={l} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: LabelColorSlug;
  onChange: (next: LabelColorSlug) => void;
  disabled?: boolean;
}) {
  const meta = LABEL_COLORS.find((c) => c.slug === value)!;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex size-9 items-center justify-center rounded-md ring-1 ring-inset ring-border transition hover:ring-foreground/40 disabled:opacity-50"
          aria-label="Цвет метки"
          title={meta.label}
        >
          <span
            className="block size-4 rounded-full ring-1 ring-inset ring-black/10"
            style={{ background: meta.hex }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="flex flex-wrap gap-1.5">
          {LABEL_COLORS.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => onChange(c.slug)}
              className={cn(
                "flex size-5 items-center justify-center rounded-full ring-1 ring-inset ring-black/10 transition hover:scale-110",
                value === c.slug && "ring-2 ring-foreground/70",
              )}
              style={{ background: c.hex }}
              aria-label={c.label}
              title={c.label}
            >
              {value === c.slug && <Check className="size-3 text-white drop-shadow" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LabelRowView({ wsSlug, label }: { wsSlug: string; label: LabelRow }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label.name);

  function saveRename() {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === label.name) {
      setDraft(label.name);
      return;
    }
    startTransition(async () => {
      const res = await renameLabelAction(wsSlug, label.id, next);
      if (!res.ok) {
        setDraft(label.name);
        toast.error(res.error);
      }
    });
  }

  function changeColor(next: LabelColorSlug) {
    if (next === label.color) return;
    startTransition(async () => {
      const res = await setLabelColorAction(wsSlug, label.id, next);
      if (!res.ok) toast.error(res.error);
    });
  }

  function remove() {
    if (!window.confirm(`Удалить метку «${label.name}»? Она снимется со всех задач.`)) return;
    startTransition(async () => {
      const res = await deleteLabelAction(wsSlug, label.id);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <ColorPicker value={label.color} onChange={changeColor} disabled={pending} />
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveRename();
            }
            if (e.key === "Escape") {
              setDraft(label.name);
              setEditing(false);
            }
          }}
          maxLength={40}
          className="h-8 flex-1 text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-1 text-left text-sm hover:underline"
        >
          {label.name}
        </button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={remove}
        disabled={pending}
        aria-label="Удалить метку"
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

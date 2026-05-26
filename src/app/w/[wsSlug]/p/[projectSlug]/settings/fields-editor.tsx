"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  createFieldAction,
  deleteFieldAction,
  moveFieldAction,
  updateFieldAction,
} from "@/actions/custom-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FIELD_TYPES, type FieldType, type SelectOption } from "@/domain/custom-fields";

type FieldView = {
  id: string;
  name: string;
  type: FieldType;
  options: SelectOption[];
  required: boolean;
};

type Draft = {
  id: string | null;
  name: string;
  type: FieldType;
  options: SelectOption[];
  required: boolean;
};

const EMPTY: Draft = {
  id: null,
  name: "",
  type: "text",
  options: [],
  required: false,
};

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Текст",
  number: "Число",
  select: "Выбор из списка",
  date: "Дата",
  url: "Ссылка",
  checkbox: "Флажок",
};

export function FieldsEditor({
  wsSlug,
  projectSlug,
  canEdit,
  initialFields,
}: {
  wsSlug: string;
  projectSlug: string;
  canEdit: boolean;
  initialFields: FieldView[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setDraft({ ...EMPTY });
  }
  function openEdit(f: FieldView) {
    setDraft({
      id: f.id,
      name: f.name,
      type: f.type,
      options: [...f.options],
      required: f.required,
    });
  }

  function submit() {
    if (!draft) return;
    startTransition(async () => {
      const res = draft.id
        ? await updateFieldAction(wsSlug, projectSlug, draft.id, {
            name: draft.name,
            options: draft.options,
            required: draft.required,
          })
        : await createFieldAction(wsSlug, projectSlug, {
            name: draft.name,
            type: draft.type,
            options: draft.options,
            required: draft.required,
          });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(draft.id ? "Поле обновлено" : "Поле создано");
        setDraft(null);
      }
    });
  }

  function remove(f: FieldView) {
    if (!window.confirm(`Удалить поле «${f.name}»? Все значения этого поля будут стёрты.`)) return;
    startTransition(async () => {
      const res = await deleteFieldAction(wsSlug, projectSlug, f.id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Поле удалено");
    });
  }

  function move(id: string, dir: "up" | "down") {
    startTransition(async () => {
      const res = await moveFieldAction(wsSlug, projectSlug, id, dir);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate} disabled={pending}>
            <Plus className="size-4" /> Новое поле
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          У вашей роли нет прав на редактирование полей. Поля видны в карточке задачи.
        </p>
      )}

      {initialFields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            У проекта пока нет дополнительных полей.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {initialFields.map((f, i) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{f.name}</span>
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {TYPE_LABEL[f.type]}
                  </span>
                  {f.required && (
                    <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      обязательное
                    </span>
                  )}
                </div>
                {f.type === "select" && f.options.length > 0 && (
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {f.options.map((o) => o.label).join(" · ")}
                  </p>
                )}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={pending || i === 0}
                    onClick={() => move(f.id, "up")}
                    title="Вверх"
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={pending || i === initialFields.length - 1}
                    onClick={() => move(f.id, "down")}
                    title="Вниз"
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => openEdit(f)}
                    disabled={pending}
                    title="Изменить"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => remove(f)}
                    disabled={pending}
                    title="Удалить"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Изменить поле" : "Новое поле"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <FieldForm draft={draft} setDraft={setDraft} disabled={pending} editMode={Boolean(draft.id)} />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              Отмена
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !draft?.name.trim() || (draft?.type === "select" && draft.options.length === 0)}
            >
              {pending ? "Сохраняем…" : draft?.id ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldForm({
  draft,
  setDraft,
  disabled,
  editMode,
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  disabled: boolean;
  editMode: boolean;
}) {
  const [optionLabel, setOptionLabel] = useState("");

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft({ ...draft, [k]: v });
  }

  function addOption() {
    const label = optionLabel.trim();
    if (!label) return;
    // value = автогенерим из label (slug-like ascii or fallback)
    const value =
      label
        .toLowerCase()
        .replace(/[^a-z0-9\-_]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || `opt-${draft.options.length + 1}`;
    if (draft.options.some((o) => o.value === value)) {
      setOptionLabel("");
      return;
    }
    patch("options", [...draft.options, { value, label }]);
    setOptionLabel("");
  }

  function removeOption(value: string) {
    patch(
      "options",
      draft.options.filter((o) => o.value !== value),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="cf-name">
          Название
        </label>
        <Input
          id="cf-name"
          value={draft.name}
          onChange={(e) => patch("name", e.target.value)}
          placeholder="Например: Story points"
          maxLength={60}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Тип</label>
        <div className="flex flex-wrap gap-1">
          {FIELD_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              disabled={disabled || editMode}
              onClick={() => patch("type", t)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-colors",
                draft.type === t
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
                (disabled || editMode) && "cursor-not-allowed opacity-60",
              )}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {editMode && (
          <p className="text-[11px] text-muted-foreground">
            Тип поменять нельзя — это снесло бы все ранее заполненные значения.
          </p>
        )}
      </div>

      {draft.type === "select" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Опции</label>
          <div className="flex flex-col gap-1">
            {draft.options.map((o) => (
              <div
                key={o.value}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <span className="flex-1 truncate">{o.label}</span>
                <span className="text-[10px] text-muted-foreground">{o.value}</span>
                <Button size="icon-xs" variant="ghost" onClick={() => removeOption(o.value)} disabled={disabled}>
                  <X className="size-3" />
                </Button>
              </div>
            ))}
            <div className="flex gap-1">
              <Input
                value={optionLabel}
                onChange={(e) => setOptionLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOption();
                  }
                }}
                placeholder="Новая опция"
                maxLength={60}
                disabled={disabled}
              />
              <Button onClick={addOption} disabled={disabled || !optionLabel.trim()}>
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={draft.required}
          onCheckedChange={(v) => patch("required", v === true)}
          disabled={disabled}
        />
        Обязательное
      </label>
    </div>
  );
}

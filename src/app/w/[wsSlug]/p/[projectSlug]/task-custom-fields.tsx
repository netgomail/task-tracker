"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { setFieldValueAction } from "@/actions/custom-fields";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FieldDef } from "@/domain/custom-fields";

export function TaskCustomFields({
  wsSlug,
  projectSlug,
  taskId,
  fields,
  values,
  onRefresh,
}: {
  wsSlug: string;
  projectSlug: string;
  taskId: string;
  fields: FieldDef[];
  values: Record<string, string>;
  onRefresh: () => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Дополнительно
      </h3>
      <div className="flex flex-col gap-2">
        {fields.map((f) => (
          <FieldRow
            key={f.id}
            wsSlug={wsSlug}
            projectSlug={projectSlug}
            taskId={taskId}
            def={f}
            initialValue={values[f.id] ?? ""}
            onSaved={onRefresh}
          />
        ))}
      </div>
    </div>
  );
}

function FieldRow({
  wsSlug,
  projectSlug,
  taskId,
  def,
  initialValue,
  onSaved,
}: {
  wsSlug: string;
  projectSlug: string;
  taskId: string;
  def: FieldDef;
  initialValue: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();

  // Если значение пришло снаружи — синхронизируем
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(initialValue);
  }, [initialValue]);

  function save(next: string) {
    if (next === initialValue) return;
    startTransition(async () => {
      const res = await setFieldValueAction(wsSlug, projectSlug, taskId, def.id, next);
      if (!res.ok) {
        toast.error(res.error);
        setValue(initialValue);
      } else {
        onSaved();
      }
    });
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {def.name}
        {def.required && <span className="text-red-500">*</span>}
      </span>
      <FieldInput
        def={def}
        value={value}
        onChange={setValue}
        onCommit={save}
        disabled={pending}
      />
    </label>
  );
}

function FieldInput({
  def,
  value,
  onChange,
  onCommit,
  disabled,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  disabled: boolean;
}) {
  switch (def.type) {
    case "text":
      return (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit(value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={disabled}
          placeholder="—"
          className="h-7 text-sm"
        />
      );
    case "url":
      return (
        <Input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit(value)}
          disabled={disabled}
          placeholder="https://…"
          className="h-7 text-sm"
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit(value)}
          disabled={disabled}
          placeholder="0"
          className="h-7 text-sm"
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onCommit(e.target.value);
          }}
          disabled={disabled}
          className="h-7 text-sm"
        />
      );
    case "select":
      return (
        <select
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onCommit(e.target.value);
          }}
          disabled={disabled}
          className={cn(
            "h-7 rounded-md border border-border bg-background px-2 text-sm",
            disabled && "opacity-60",
          )}
        >
          <option value="">—</option>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {/* Сохранённое значение с удалённой опцией — рендерим серым, чтобы не терять данные */}
          {value && !def.options.some((o) => o.value === value) && (
            <option value={value}>{value} (удалено)</option>
          )}
        </select>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value === "true"}
            onCheckedChange={(v) => {
              const next = v === true ? "true" : "false";
              onChange(next);
              onCommit(next);
            }}
            disabled={disabled}
          />
          {value === "true" ? "Да" : "Нет"}
        </label>
      );
    default:
      return null;
  }
}

"use client";

import { useState, useTransition } from "react";
import { GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ColorPicker } from "@/components/color-picker";
import { confirmDialog } from "@/components/confirm-dialog";

import {
  createTemplateAction,
  deleteTemplateAction,
  updateTemplateAction,
} from "@/actions/templates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type LabelColorSlug, colorHex, isLabelColor } from "@/lib/colors";
import { TASK_PRIORITIES, TASK_TYPES, type TaskPriority, type TaskType } from "@/domain/types";
import { TASK_PRIORITY_META, TASK_TYPE_META } from "@/lib/task-meta";
import type { LabelRow } from "@/services/labels";

type TemplateView = {
  id: string;
  name: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  color: LabelColorSlug;
  labelIds: string[];
  subtasks: string[];
};

type DraftState = {
  id: string | null;
  name: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  color: LabelColorSlug;
  labelIds: string[];
  subtasks: string[];
};

const EMPTY: DraftState = {
  id: null,
  name: "",
  description: "",
  type: "task",
  priority: "normal",
  color: "slate",
  labelIds: [],
  subtasks: [],
};

export function TemplatesManager({
  wsSlug,
  initialTemplates,
  labels,
}: {
  wsSlug: string;
  initialTemplates: TemplateView[];
  labels: LabelRow[];
}) {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setDraft({ ...EMPTY });
  }

  function openEdit(t: TemplateView) {
    setDraft({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      type: t.type,
      priority: t.priority,
      color: t.color,
      labelIds: [...t.labelIds],
      subtasks: [...t.subtasks],
    });
  }

  function submit() {
    if (!draft) return;
    const payload = {
      name: draft.name,
      description: draft.description,
      type: draft.type,
      priority: draft.priority,
      color: draft.color,
      labelIds: draft.labelIds,
      subtasks: draft.subtasks,
    };
    startTransition(async () => {
      const res = draft.id
        ? await updateTemplateAction(wsSlug, draft.id, payload)
        : await createTemplateAction(wsSlug, payload);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(draft.id ? "Шаблон обновлён" : "Шаблон создан");
        setDraft(null);
      }
    });
  }

  async function remove(id: string, name: string) {
    if (!(await confirmDialog({ title: "Удалить шаблон?", description: `«${name}»` }))) return;
    startTransition(async () => {
      const res = await deleteTemplateAction(wsSlug, id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Шаблон удалён");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Всего шаблонов: {initialTemplates.length}
        </p>
        <Button onClick={openCreate} size="sm">
          <Plus className="size-4" /> Новый шаблон
        </Button>
      </div>

      {initialTemplates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Шаблонов пока нет. Создайте первый или сохраните существующую задачу как шаблон
            через меню «⋯ → Сохранить как шаблон».
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {initialTemplates.map((t) => (
            <li
              key={t.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-full"
                  style={{ background: colorHex(t.color) }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{t.name}</span>
                    <TypeChip type={t.type} />
                    <PriorityChip priority={t.priority} />
                  </div>
                  {t.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {t.labelIds.length > 0 && (
                      <span>{t.labelIds.length} меток</span>
                    )}
                    {t.subtasks.length > 0 && (
                      <span>· {t.subtasks.length} подзадач</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => openEdit(t)}
                  disabled={pending}
                  title="Изменить"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => remove(t.id, t.name)}
                  disabled={pending}
                  title="Удалить"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Изменить шаблон" : "Новый шаблон"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <TemplateForm
              draft={draft}
              setDraft={setDraft}
              labels={labels}
              disabled={pending}
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              Отмена
            </Button>
            <Button onClick={submit} disabled={pending || !draft?.name.trim()}>
              {pending ? "Сохраняем…" : draft?.id ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateForm({
  draft,
  setDraft,
  labels,
  disabled,
}: {
  draft: DraftState;
  setDraft: (next: DraftState) => void;
  labels: LabelRow[];
  disabled: boolean;
}) {
  const [subtaskInput, setSubtaskInput] = useState("");

  function patch<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft({ ...draft, [key]: value });
  }

  function toggleLabel(id: string) {
    const has = draft.labelIds.includes(id);
    patch("labelIds", has ? draft.labelIds.filter((x) => x !== id) : [...draft.labelIds, id]);
  }

  function addSubtask() {
    const next = subtaskInput.trim();
    if (!next) return;
    patch("subtasks", [...draft.subtasks, next]);
    setSubtaskInput("");
  }

  function removeSubtask(index: number) {
    patch(
      "subtasks",
      draft.subtasks.filter((_, i) => i !== index),
    );
  }

  function moveSubtask(from: number, to: number) {
    if (to < 0 || to >= draft.subtasks.length) return;
    const next = [...draft.subtasks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    patch("subtasks", next);
  }

  return (
    <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="tpl-name">
          Название
        </label>
        <Input
          id="tpl-name"
          value={draft.name}
          onChange={(e) => patch("name", e.target.value)}
          placeholder="Например: Подготовить релиз"
          maxLength={120}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="tpl-desc">
          Описание
        </label>
        <Textarea
          id="tpl-desc"
          value={draft.description}
          onChange={(e) => patch("description", e.target.value)}
          rows={3}
          placeholder="Необязательно"
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Тип">
          <div className="flex flex-wrap gap-1">
            {TASK_TYPES.map((t) => {
              const meta = TASK_TYPE_META[t];
              const Icon = meta.Icon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => patch("type", t)}
                  disabled={disabled}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                    draft.type === t
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Приоритет">
          <div className="flex flex-wrap gap-1">
            {TASK_PRIORITIES.map((p) => {
              const meta = TASK_PRIORITY_META[p];
              const Icon = meta.Icon;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => patch("priority", p)}
                  disabled={disabled}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                    draft.priority === p
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Цвет">
          <ColorPicker
            value={draft.color}
            onPick={(slug) => patch("color", slug)}
            disabled={disabled}
            size="lg"
          />
        </Field>
      </div>

      <Field label="Метки">
        {labels.length === 0 ? (
          <p className="text-xs text-muted-foreground">В workspace ещё нет меток.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {labels.map((l) => {
              const active = draft.labelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLabel(l.id)}
                  disabled={disabled}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{
                      background: isLabelColor(l.color) ? colorHex(l.color) : "#64748b",
                    }}
                  />
                  {l.name}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <Field label={`Подзадачи (${draft.subtasks.length})`}>
        <div className="flex flex-col gap-1">
          {draft.subtasks.map((s, i) => (
            <div
              key={`${i}-${s}`}
              className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => moveSubtask(i, i - 1)}
                  disabled={disabled || i === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Вверх"
                >
                  <GripVertical className="size-3" />
                </button>
              </div>
              <span className="flex-1 truncate text-sm">{s}</span>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => removeSubtask(i)}
                disabled={disabled}
                title="Удалить"
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
          <div className="flex gap-1">
            <Input
              value={subtaskInput}
              onChange={(e) => setSubtaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSubtask();
                }
              }}
              placeholder="Добавить подзадачу…"
              disabled={disabled}
              maxLength={200}
            />
            <Button onClick={addSubtask} disabled={disabled || !subtaskInput.trim()}>
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function TypeChip({ type }: { type: TaskType }) {
  const meta = TASK_TYPE_META[type];
  const Icon = meta.Icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

function PriorityChip({ priority }: { priority: TaskPriority }) {
  const meta = TASK_PRIORITY_META[priority];
  const Icon = meta.Icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

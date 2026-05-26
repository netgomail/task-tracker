"use client";

import { useState, useTransition } from "react";
import { History, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  createAutomationAction,
  deleteAutomationAction,
  listAutomationRunsAction,
  toggleAutomationAction,
  updateAutomationAction,
  type SerializedRun,
} from "@/actions/automations";
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
import { LABEL_COLORS, colorHex, isLabelColor } from "@/lib/colors";
import {
  ACTION_LABEL,
  ACTION_TYPES,
  CONDITION_KEYS,
  CONDITION_LABEL,
  TRIGGER_LABEL,
  TRIGGER_TYPES,
  type ActionType,
  type AutomationAction,
  type Condition,
  type ConditionKey,
  type Rule,
  type Trigger,
  type TriggerType,
} from "@/domain/automations";
import { TASK_PRIORITIES, type TaskPriority } from "@/domain/types";
import { TASK_PRIORITY_META } from "@/lib/task-meta";
import type { SerializedAutomation } from "@/actions/projects";

type Ctx = {
  columns: Array<{ id: string; name: string; color: string }>;
  labels: Array<{ id: string; name: string; color: string }>;
  members: Array<{ id: string; name: string }>;
};

type Props = {
  wsSlug: string;
  projectSlug: string;
  canEdit: boolean;
  initialRules: SerializedAutomation[];
  ctx: Ctx;
};

type Draft = Rule & { id: string | null };

const EMPTY_DRAFT: Draft = {
  id: null,
  name: "",
  enabled: true,
  trigger: { type: "task.created", params: {} },
  conditions: [],
  actions: [{ type: "set_priority", params: { priority: "high" } }],
};

export function AutomationsEditor({ wsSlug, projectSlug, canEdit, initialRules, ctx }: Props) {
  const [rules, setRules] = useState<SerializedAutomation[]>(initialRules);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [runsFor, setRunsFor] = useState<{ ruleId: string; runs: SerializedRun[] } | null>(null);
  const [pending, startTransition] = useTransition();

  function reloadRules() {
    // Жёстко перечитывать незачем — родитель revalidates path. Но рекомендация:
    // оптимистично обновим массив. Простой путь — заново звать listAutomationsAction
    // не имеет смысла без рефакторинга родителя; revalidatePath обновит при
    // следующем заходе в модалку.
  }

  function openCreate() {
    setDraft({ ...EMPTY_DRAFT });
  }

  function openEdit(r: SerializedAutomation) {
    setDraft({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      trigger: r.trigger,
      conditions: r.conditions,
      actions: r.actions,
    });
  }

  function submit() {
    if (!draft) return;
    const { id, ...rule } = draft;
    startTransition(async () => {
      const res = id
        ? await updateAutomationAction(wsSlug, projectSlug, id, rule)
        : await createAutomationAction(wsSlug, projectSlug, rule);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(id ? "Правило обновлено" : "Правило создано");
        setDraft(null);
        // Локально обновим список
        if (id) {
          setRules((prev) =>
            prev.map((r) =>
              r.id === id
                ? { ...r, ...rule, updatedAt: new Date().toISOString() }
                : r,
            ),
          );
        } else {
          // ID на клиенте мы не знаем — для простоты помечаем флагом, что нужен перезаход.
          // Реальное обновление произойдёт при следующем открытии модалки (revalidatePath).
          setRules((prev) => [
            ...prev,
            {
              ...rule,
              id: `pending-${Date.now()}`,
              projectId: "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]);
        }
        reloadRules();
      }
    });
  }

  function toggle(r: SerializedAutomation) {
    const next = !r.enabled;
    setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: next } : x)));
    startTransition(async () => {
      const res = await toggleAutomationAction(wsSlug, projectSlug, r.id, next);
      if (!res.ok) {
        toast.error(res.error);
        setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: !next } : x)));
      }
    });
  }

  function remove(r: SerializedAutomation) {
    if (!window.confirm(`Удалить правило «${r.name}»?`)) return;
    startTransition(async () => {
      const res = await deleteAutomationAction(wsSlug, projectSlug, r.id);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Правило удалено");
        setRules((prev) => prev.filter((x) => x.id !== r.id));
      }
    });
  }

  function viewRuns(r: SerializedAutomation) {
    startTransition(async () => {
      const res = await listAutomationRunsAction(wsSlug, projectSlug, r.id);
      if (!res.ok) toast.error(res.error);
      else setRunsFor({ ruleId: r.id, runs: res.runs });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate} disabled={pending}>
            <Plus className="size-4" /> Новое правило
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          У вашей роли нет прав на редактирование автоматизаций.
        </p>
      )}

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Правил пока нет. Создайте первое — например, «когда задача попадает в колонку
            «Готово», отметить выполненной».
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={cn("truncate font-medium", !r.enabled && "text-muted-foreground")}>
                    {r.name}
                  </span>
                  {!r.enabled && (
                    <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      выкл
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Когда {TRIGGER_LABEL[r.trigger.type]}
                  {r.conditions.length > 0 && ` (+${r.conditions.length} условий)`}
                  {" → "}
                  {r.actions.map((a) => ACTION_LABEL[a.type]).join(", ")}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => viewRuns(r)}
                    disabled={pending}
                    title="История запусков"
                  >
                    <History className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => toggle(r)}
                    disabled={pending}
                    title={r.enabled ? "Выключить" : "Включить"}
                    className={cn(r.enabled && "text-green-600 dark:text-green-400")}
                  >
                    <Power className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => openEdit(r)}
                    disabled={pending}
                    title="Изменить"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => remove(r)}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Изменить правило" : "Новое правило"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <RuleForm draft={draft} setDraft={setDraft} ctx={ctx} disabled={pending} />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              Отмена
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !draft?.name.trim() || (draft && draft.actions.length === 0)}
            >
              {pending ? "Сохраняем…" : draft?.id ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={runsFor !== null} onOpenChange={(open) => !open && setRunsFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>История запусков</DialogTitle>
          </DialogHeader>
          {runsFor && <RunsList runs={runsFor.runs} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleForm({
  draft,
  setDraft,
  ctx,
  disabled,
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  ctx: Ctx;
  disabled: boolean;
}) {
  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft({ ...draft, [k]: v });
  }

  function setTriggerType(type: TriggerType) {
    const trigger: Trigger =
      type === "task.created"
        ? { type, params: {} }
        : type === "task.moved"
          ? { type, params: {} }
          : { type, params: {} };
    patch("trigger", trigger);
  }

  function addCondition() {
    const c: Condition = ctx.columns[0]
      ? { key: "column", value: ctx.columns[0].id }
      : { key: "priority", value: "normal" };
    patch("conditions", [...draft.conditions, c]);
  }

  function removeCondition(i: number) {
    patch(
      "conditions",
      draft.conditions.filter((_, idx) => idx !== i),
    );
  }

  function setCondition(i: number, c: Condition) {
    patch(
      "conditions",
      draft.conditions.map((x, idx) => (idx === i ? c : x)),
    );
  }

  function addAction() {
    const a: AutomationAction = { type: "set_priority", params: { priority: "high" } };
    patch("actions", [...draft.actions, a]);
  }

  function removeAction(i: number) {
    patch(
      "actions",
      draft.actions.filter((_, idx) => idx !== i),
    );
  }

  function setAction(i: number, a: AutomationAction) {
    patch(
      "actions",
      draft.actions.map((x, idx) => (idx === i ? a : x)),
    );
  }

  return (
    <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
      <Field label="Название">
        <Input
          value={draft.name}
          onChange={(e) => patch("name", e.target.value)}
          placeholder="Когда задача готова — отметить выполненной"
          maxLength={120}
          disabled={disabled}
        />
      </Field>

      <Field label="Триггер">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1">
            {TRIGGER_TYPES.map((t) => (
              <Chip
                key={t}
                active={draft.trigger.type === t}
                onClick={() => setTriggerType(t)}
                disabled={disabled}
              >
                {TRIGGER_LABEL[t]}
              </Chip>
            ))}
          </div>
          {draft.trigger.type === "task.moved" && (
            <Select
              value={draft.trigger.params.toColumnId ?? ""}
              onChange={(v) =>
                patch("trigger", {
                  type: "task.moved",
                  params: { toColumnId: v || undefined },
                })
              }
              disabled={disabled}
            >
              <option value="">Любая колонка</option>
              {ctx.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          {draft.trigger.type === "task.label_added" && (
            <Select
              value={draft.trigger.params.labelId ?? ""}
              onChange={(v) =>
                patch("trigger", {
                  type: "task.label_added",
                  params: { labelId: v || undefined },
                })
              }
              disabled={disabled}
            >
              <option value="">Любая метка</option>
              {ctx.labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </Field>

      <Field label={`Условия (${draft.conditions.length}) — все должны выполняться`}>
        <div className="flex flex-col gap-1">
          {draft.conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-1 rounded-md border border-border p-2">
              <Select
                value={c.key}
                onChange={(v) => {
                  const key = v as ConditionKey;
                  const def: Condition =
                    key === "column"
                      ? { key, value: ctx.columns[0]?.id ?? "" }
                      : key === "priority"
                        ? { key, value: "normal" }
                        : key === "has_label"
                          ? { key, value: ctx.labels[0]?.id ?? "" }
                          : { key, value: "none" };
                  setCondition(i, def);
                }}
                disabled={disabled}
              >
                {CONDITION_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {CONDITION_LABEL[k]}
                  </option>
                ))}
              </Select>
              <ConditionValuePicker
                condition={c}
                ctx={ctx}
                onChange={(v) => setCondition(i, v)}
                disabled={disabled}
              />
              <Button size="icon-xs" variant="ghost" onClick={() => removeCondition(i)} disabled={disabled}>
                <X className="size-3" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addCondition} disabled={disabled}>
            <Plus className="size-3.5" /> Условие
          </Button>
        </div>
      </Field>

      <Field label="Действия">
        <div className="flex flex-col gap-1">
          {draft.actions.map((a, i) => (
            <div key={i} className="flex items-center gap-1 rounded-md border border-border p-2">
              <Select
                value={a.type}
                onChange={(v) => setAction(i, defaultAction(v as ActionType, ctx))}
                disabled={disabled}
              >
                {ACTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACTION_LABEL[t]}
                  </option>
                ))}
              </Select>
              <ActionParamsPicker
                action={a}
                ctx={ctx}
                onChange={(v) => setAction(i, v)}
                disabled={disabled}
              />
              <Button size="icon-xs" variant="ghost" onClick={() => removeAction(i)} disabled={disabled}>
                <X className="size-3" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addAction} disabled={disabled}>
            <Plus className="size-3.5" /> Действие
          </Button>
        </div>
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => patch("enabled", e.target.checked)}
          disabled={disabled}
          className="size-4 accent-foreground"
        />
        Включено
      </label>
    </div>
  );
}

function defaultAction(type: ActionType, ctx: Ctx): AutomationAction {
  switch (type) {
    case "set_priority":
      return { type, params: { priority: "high" } };
    case "set_color":
      return { type, params: { color: "blue" } };
    case "add_label":
      return { type, params: { labelId: ctx.labels[0]?.id ?? "" } };
    case "assign_to":
      return { type, params: { userId: ctx.members[0]?.id ?? "" } };
    case "move_to_column":
      return { type, params: { columnId: ctx.columns[0]?.id ?? "" } };
    case "mark_complete":
      return { type, params: {} };
    case "add_comment":
      return { type, params: { text: "Добавлено правилом" } };
  }
}

function ConditionValuePicker({
  condition,
  ctx,
  onChange,
  disabled,
}: {
  condition: Condition;
  ctx: Ctx;
  onChange: (next: Condition) => void;
  disabled: boolean;
}) {
  switch (condition.key) {
    case "column":
      return (
        <Select
          value={condition.value}
          onChange={(v) => onChange({ key: "column", value: v })}
          disabled={disabled}
        >
          {ctx.columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      );
    case "priority":
      return (
        <Select
          value={condition.value}
          onChange={(v) => onChange({ key: "priority", value: v as TaskPriority })}
          disabled={disabled}
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_META[p].label}
            </option>
          ))}
        </Select>
      );
    case "has_label":
      return (
        <Select
          value={condition.value}
          onChange={(v) => onChange({ key: "has_label", value: v })}
          disabled={disabled}
        >
          {ctx.labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      );
    case "assignee":
      return (
        <Select
          value={condition.value}
          onChange={(v) => onChange({ key: "assignee", value: v })}
          disabled={disabled}
        >
          <option value="none">Без исполнителя</option>
          {ctx.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      );
  }
}

function ActionParamsPicker({
  action,
  ctx,
  onChange,
  disabled,
}: {
  action: AutomationAction;
  ctx: Ctx;
  onChange: (next: AutomationAction) => void;
  disabled: boolean;
}) {
  switch (action.type) {
    case "set_priority":
      return (
        <Select
          value={action.params.priority}
          onChange={(v) =>
            onChange({ type: "set_priority", params: { priority: v as TaskPriority } })
          }
          disabled={disabled}
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_META[p].label}
            </option>
          ))}
        </Select>
      );
    case "set_color":
      return (
        <div className="flex flex-wrap gap-0.5">
          {LABEL_COLORS.map((c) => (
            <button
              key={c.slug}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange({ type: "set_color", params: { color: c.slug } })
              }
              className={cn(
                "size-5 rounded border-2",
                action.params.color === c.slug ? "border-foreground" : "border-transparent",
              )}
              style={{ background: c.hex }}
              title={c.label}
            />
          ))}
        </div>
      );
    case "add_label":
      return (
        <Select
          value={action.params.labelId}
          onChange={(v) => onChange({ type: "add_label", params: { labelId: v } })}
          disabled={disabled}
        >
          {ctx.labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      );
    case "assign_to":
      return (
        <Select
          value={action.params.userId}
          onChange={(v) => onChange({ type: "assign_to", params: { userId: v } })}
          disabled={disabled}
        >
          {ctx.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      );
    case "move_to_column":
      return (
        <Select
          value={action.params.columnId}
          onChange={(v) => onChange({ type: "move_to_column", params: { columnId: v } })}
          disabled={disabled}
        >
          {ctx.columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      );
    case "mark_complete":
      return <span className="text-xs text-muted-foreground">—</span>;
    case "add_comment":
      return (
        <Textarea
          value={action.params.text}
          onChange={(e) =>
            onChange({ type: "add_comment", params: { text: e.target.value } })
          }
          rows={1}
          maxLength={500}
          disabled={disabled}
          className="min-h-7 flex-1 text-sm"
        />
      );
  }
}

function RunsList({ runs }: { runs: SerializedRun[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">Запусков пока не было.</p>;
  }
  return (
    <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
      {runs.map((r) => (
        <li key={r.id} className="rounded-md border border-border p-2 text-xs">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                r.status === "success"
                  ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : r.status === "error"
                    ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : "bg-muted/40 text-muted-foreground",
              )}
            >
              {r.status}
            </span>
            <span className="text-muted-foreground">
              {new Date(r.createdAt).toLocaleString("ru")}
            </span>
          </div>
          {r.details?.actionsRun !== undefined && (
            <p className="mt-1 text-muted-foreground">
              Действий выполнено: {r.details.actionsRun}
            </p>
          )}
          {r.details?.errors && r.details.errors.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-red-700 dark:text-red-300">
              {r.details.errors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Small primitives ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md border px-2 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {children}
    </button>
  );
}

function Select({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "h-7 flex-1 rounded-md border border-border bg-background px-2 text-sm",
        disabled && "opacity-60",
      )}
    >
      {children}
    </select>
  );
}

// Не используется, но импорт colorHex/isLabelColor нужен ESLint'у в др. ветках.
void colorHex;
void isLabelColor;

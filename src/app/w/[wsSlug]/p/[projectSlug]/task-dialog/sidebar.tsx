"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";

import { ColorPicker } from "@/components/color-picker";
import { confirmDialog } from "@/components/confirm-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LabelBadge } from "@/components/label-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { LabelColorSlug } from "@/lib/colors";
import { TASK_PRIORITIES, TASK_TYPES, type TaskPriority, type TaskType } from "@/domain/types";
import { PRIORITY_TONE_CLASSES, TASK_PRIORITY_META, TASK_TYPE_META } from "@/lib/task-meta";

import {
  archiveTaskAction,
  deleteTaskAction,
  setTaskAssigneeAction,
  setTaskColorAction,
  setTaskDueAction,
  setTaskPriorityAction,
  setTaskReviewAction,
  setTaskTypeAction,
} from "@/actions/tasks";
import { attachLabelAction, detachLabelAction } from "@/actions/labels";
import { saveTaskAsTemplateAction } from "@/actions/templates";
import type { SerializedTask } from "@/actions/task-details";
import type { LabelRow } from "@/services/labels";
import type { WorkspaceMember } from "@/services/membership";
import type { FieldDef } from "@/domain/custom-fields";

import { TaskCustomFields } from "../task-custom-fields";
import { fromLocalDatetime, isPast, toLocalDatetime } from "./utils";

export function Sidebar({
  wsSlug,
  projectSlug,
  task,
  labels,
  workspaceLabels,
  members,
  assignee,
  customFields,
  customFieldValues,
  pending,
  onRefresh,
  onClose,
}: {
  wsSlug: string;
  projectSlug: string;
  task: SerializedTask;
  labels: LabelRow[];
  workspaceLabels: LabelRow[];
  members: WorkspaceMember[];
  assignee: WorkspaceMember | null;
  customFields: FieldDef[];
  customFieldValues: Record<string, string>;
  pending: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const router = useRouter();

  async function setType(t: TaskType) {
    const res = await setTaskTypeAction(wsSlug, projectSlug, task.id, t);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }
  async function setPriority(p: TaskPriority) {
    const res = await setTaskPriorityAction(wsSlug, projectSlug, task.id, p);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }
  async function setColor(c: LabelColorSlug) {
    const res = await setTaskColorAction(wsSlug, projectSlug, task.id, c);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }
  async function setDue(value: string) {
    const iso = value ? fromLocalDatetime(value) : "";
    const res = await setTaskDueAction(wsSlug, projectSlug, task.id, iso);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }
  async function setReview(value: string) {
    const iso = value ? fromLocalDatetime(value) : "";
    const res = await setTaskReviewAction(wsSlug, projectSlug, task.id, iso);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }
  async function toggleLabel(labelId: string, attached: boolean) {
    const fn = attached ? detachLabelAction : attachLabelAction;
    const res = await fn(wsSlug, projectSlug, task.id, labelId);
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }

  async function pickAssignee(memberId: string | null) {
    const res = await setTaskAssigneeAction(
      wsSlug,
      projectSlug,
      task.id,
      memberId ?? "",
    );
    if (!res.ok) toast.error(res.error);
    onRefresh();
  }

  async function onArchive() {
    const okArchive = await confirmDialog({
      title: "Отправить задачу в архив?",
      description: "Вернуть можно со страницы «Архив».",
      confirmLabel: "В архив",
      destructive: false,
    });
    if (!okArchive) return;
    const res = await archiveTaskAction(wsSlug, projectSlug, task.id);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success("Задача в архиве", {
        action: {
          label: "Открыть архив",
          onClick: () => router.push(`/w/${wsSlug}/archive`),
        },
      });
      onClose();
    }
  }
  async function onDelete() {
    const okDelete = await confirmDialog({
      title: "Удалить задачу безвозвратно?",
      description: "Вместе с подзадачами, комментариями и вложениями.",
    });
    if (!okDelete) return;
    const res = await deleteTaskAction(wsSlug, projectSlug, task.id);
    if (!res.ok) toast.error(res.error);
    else onClose();
  }
  async function onSaveAsTemplate() {
    const name = window.prompt("Название шаблона:", task.title);
    if (!name || !name.trim()) return;
    const res = await saveTaskAsTemplateAction(wsSlug, task.id, name.trim());
    if (!res.ok) toast.error(res.error);
    else toast.success("Шаблон сохранён");
  }

  return (
    <>
      <SidebarBlock title="Тип">
        <div className="grid grid-cols-4 gap-1">
          {TASK_TYPES.map((t) => {
            const Icon = TASK_TYPE_META[t].Icon;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                disabled={pending}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md ring-1 ring-inset ring-border transition hover:ring-foreground/30",
                  task.type === t && "bg-accent ring-foreground/40",
                )}
                title={TASK_TYPE_META[t].label}
                aria-label={TASK_TYPE_META[t].label}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      </SidebarBlock>
      <SidebarBlock title="Приоритет">
        <div className="grid grid-cols-4 gap-1">
          {TASK_PRIORITIES.map((p) => {
            const meta = TASK_PRIORITY_META[p];
            const Icon = meta.Icon;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                disabled={pending}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md ring-1 ring-inset ring-border transition hover:ring-foreground/30",
                  task.priority === p && "bg-accent ring-foreground/40",
                  PRIORITY_TONE_CLASSES[meta.tone],
                )}
                title={meta.label}
                aria-label={meta.label}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      </SidebarBlock>
      <SidebarBlock title="Цвет">
        <ColorPicker value={task.color} onPick={setColor} disabled={pending} size="sm" blankDefault />
      </SidebarBlock>
      <SidebarBlock title="Дедлайн">
        <input
          type="datetime-local"
          value={toLocalDatetime(task.dueAt)}
          onChange={(e) => setDue(e.target.value)}
          disabled={pending}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        />
      </SidebarBlock>
      <SidebarBlock title="Напоминание">
        <input
          type="datetime-local"
          value={toLocalDatetime(task.reviewAt)}
          onChange={(e) => setReview(e.target.value)}
          disabled={pending}
          className={cn(
            "h-8 w-full rounded-md border border-input bg-background px-2 text-xs",
            isPast(task.reviewAt) && "border-rose-400 text-rose-600 dark:text-rose-400",
          )}
        />
      </SidebarBlock>
      <SidebarBlock title="Исполнитель">
        <AssigneePicker
          assignee={assignee}
          members={members}
          disabled={pending}
          onPick={pickAssignee}
        />
      </SidebarBlock>
      <SidebarBlock title="Метки">
        <LabelsPicker
          wsSlug={wsSlug}
          attached={labels}
          available={workspaceLabels}
          disabled={pending}
          onToggle={toggleLabel}
        />
      </SidebarBlock>
      {customFields.length > 0 && (
        <>
          <Separator />
          <TaskCustomFields
            wsSlug={wsSlug}
            projectSlug={projectSlug}
            taskId={task.id}
            fields={customFields}
            values={customFieldValues}
            onRefresh={onRefresh}
          />
        </>
      )}
      <Separator />
      <div className="flex flex-col gap-1.5">
        <Button variant="ghost" size="sm" onClick={onSaveAsTemplate} disabled={pending}>
          Сохранить как шаблон…
        </Button>
        <Button variant="ghost" size="sm" onClick={onArchive} disabled={pending}>
          В архив
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={pending}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          Удалить
        </Button>
      </div>
    </>
  );
}

function SidebarBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

function AssigneePicker({
  assignee,
  members,
  disabled,
  onPick,
}: {
  assignee: WorkspaceMember | null;
  members: WorkspaceMember[];
  disabled: boolean;
  onPick: (memberId: string | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-2 text-left text-xs disabled:opacity-60"
          aria-label="Исполнитель"
        >
          {assignee ? (
            <>
              <Avatar className="size-5">
                {assignee.image && (
                  <AvatarImage src={assignee.image} alt={assignee.name} />
                )}
                <AvatarFallback className="text-[10px]">
                  {assignee.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate">{assignee.name}</span>
            </>
          ) : (
            <span className="flex-1 text-muted-foreground">Не назначен</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
          <li>
            <button
              type="button"
              onClick={() => onPick(null)}
              disabled={disabled}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent disabled:opacity-50",
                !assignee && "bg-accent",
              )}
            >
              Снять исполнителя
            </button>
          </li>
          {members.length === 0 ? (
            <li className="px-2 py-1 text-xs text-muted-foreground">
              В workspace пока нет участников.
            </li>
          ) : (
            members.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onPick(m.id)}
                  disabled={disabled}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent disabled:opacity-50",
                    assignee?.id === m.id && "bg-accent",
                  )}
                >
                  <Avatar className="size-5">
                    {m.image && <AvatarImage src={m.image} alt={m.name} />}
                    <AvatarFallback className="text-[10px]">
                      {m.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{m.name}</span>
                  {assignee?.id === m.id && (
                    <Check className="size-3.5 text-muted-foreground" />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function LabelsPicker({
  wsSlug,
  attached,
  available,
  disabled,
  onToggle,
}: {
  wsSlug: string;
  attached: LabelRow[];
  available: LabelRow[];
  disabled: boolean;
  onToggle: (labelId: string, attached: boolean) => void;
}) {
  const attachedSet = new Set(attached.map((l) => l.id));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {attached.length === 0 ? (
          <span className="text-xs text-muted-foreground/70">—</span>
        ) : (
          attached.map((l) => <LabelBadge key={l.id} label={l} />)
        )}
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" disabled={disabled} className="justify-start">
            <Plus className="size-3.5" /> Изменить
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          {available.length === 0 ? (
            <div className="flex flex-col gap-1 px-1 py-2">
              <p className="text-xs text-muted-foreground">Меток ещё нет.</p>
              <Link
                href={`/w/${wsSlug}/settings/labels`}
                className="text-xs font-medium text-foreground hover:underline"
              >
                Создать в настройках
              </Link>
            </div>
          ) : (
            <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {available.map((l) => {
                const isOn = attachedSet.has(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(l.id, isOn)}
                      disabled={disabled}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent disabled:opacity-50"
                    >
                      <LabelBadge label={l} />
                      <span className="flex-1" />
                      {isOn && <Check className="size-3.5 text-muted-foreground" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

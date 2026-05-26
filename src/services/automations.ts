import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { automationRuns, automations } from "@/db/schema/automations";
import { taskLabels } from "@/db/schema/labels";
import { tasks } from "@/db/schema/tasks";
import {
  ActionSchema,
  ConditionSchema,
  RuleSchema,
  TriggerSchema,
  type AutomationAction,
  type AutomationRow,
  type Condition,
  type Rule,
  type Trigger,
} from "@/domain/automations";
import { type LabelColorSlug, isLabelColor } from "@/lib/colors";
import { newId } from "@/lib/ids";

// ── AsyncLocalStorage для anti-loop ─────────────────────────────────────────

const MAX_DEPTH = 3;
const als = new AsyncLocalStorage<{ depth: number }>();

function currentDepth(): number {
  return als.getStore()?.depth ?? 0;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

function parseRow(r: typeof automations.$inferSelect): AutomationRow | null {
  const trigger = TriggerSchema.safeParse(safeJson(r.trigger));
  if (!trigger.success) return null;
  const conds = r.conditions
    ? safeJsonArray(r.conditions).map((c) => ConditionSchema.safeParse(c))
    : [];
  const conditions: Condition[] = conds.flatMap((c) => (c.success ? [c.data] : []));
  const acts = safeJsonArray(r.actions).map((a) => ActionSchema.safeParse(a));
  const actions: AutomationAction[] = acts.flatMap((a) => (a.success ? [a.data] : []));
  if (actions.length === 0) return null;
  return {
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    enabled: r.enabled,
    trigger: trigger.data,
    conditions,
    actions,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function safeJsonArray(raw: string | null): unknown[] {
  const parsed = safeJson(raw);
  return Array.isArray(parsed) ? parsed : [];
}

export async function listForProject(projectId: string): Promise<AutomationRow[]> {
  const rows = await db
    .select()
    .from(automations)
    .where(eq(automations.projectId, projectId))
    .orderBy(asc(automations.createdAt));
  return rows.map(parseRow).filter((r): r is AutomationRow => r !== null);
}

export type CreateRuleInput = {
  workspaceId: string;
  projectId: string;
  createdBy: string;
  rule: Rule;
};

export async function createRule(input: CreateRuleInput): Promise<string> {
  const id = newId();
  await db.insert(automations).values({
    id,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    name: input.rule.name,
    enabled: input.rule.enabled,
    trigger: JSON.stringify(input.rule.trigger),
    conditions: input.rule.conditions.length > 0 ? JSON.stringify(input.rule.conditions) : null,
    actions: JSON.stringify(input.rule.actions),
    createdBy: input.createdBy,
  });
  return id;
}

async function assertRuleInWorkspace(
  workspaceId: string,
  ruleId: string,
): Promise<{ projectId: string }> {
  const [row] = await db
    .select({ workspaceId: automations.workspaceId, projectId: automations.projectId })
    .from(automations)
    .where(eq(automations.id, ruleId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) throw new Error("Rule not in workspace");
  return { projectId: row.projectId };
}

export async function updateRule(
  workspaceId: string,
  ruleId: string,
  rule: Rule,
): Promise<void> {
  await assertRuleInWorkspace(workspaceId, ruleId);
  await db
    .update(automations)
    .set({
      name: rule.name,
      enabled: rule.enabled,
      trigger: JSON.stringify(rule.trigger),
      conditions: rule.conditions.length > 0 ? JSON.stringify(rule.conditions) : null,
      actions: JSON.stringify(rule.actions),
      updatedAt: new Date(),
    })
    .where(eq(automations.id, ruleId));
}

export async function setEnabled(
  workspaceId: string,
  ruleId: string,
  enabled: boolean,
): Promise<void> {
  await assertRuleInWorkspace(workspaceId, ruleId);
  await db
    .update(automations)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(automations.id, ruleId));
}

export async function removeRule(workspaceId: string, ruleId: string): Promise<void> {
  await assertRuleInWorkspace(workspaceId, ruleId);
  await db.delete(automations).where(eq(automations.id, ruleId));
}

export type RunRow = {
  id: string;
  status: "success" | "error" | "skipped";
  details: { actionsRun?: number; errors?: string[] } | null;
  createdAt: Date;
};

export async function listRecentRuns(
  workspaceId: string,
  ruleId: string,
  limit = 20,
): Promise<RunRow[]> {
  await assertRuleInWorkspace(workspaceId, ruleId);
  const rows = await db
    .select({
      id: automationRuns.id,
      status: automationRuns.status,
      details: automationRuns.details,
      createdAt: automationRuns.createdAt,
    })
    .from(automationRuns)
    .where(eq(automationRuns.automationId, ruleId))
    .orderBy(desc(automationRuns.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    status: (r.status === "success" || r.status === "error" || r.status === "skipped"
      ? r.status
      : "error") as RunRow["status"],
    details: r.details ? (safeJson(r.details) as RunRow["details"]) : null,
    createdAt: r.createdAt,
  }));
}

// ── Runner ───────────────────────────────────────────────────────────────────

export type AutomationEvent =
  | { type: "task.created"; workspaceId: string; projectId: string; taskId: string; actorId: string }
  | {
      type: "task.moved";
      workspaceId: string;
      projectId: string;
      taskId: string;
      actorId: string;
      toColumnId: string;
    }
  | {
      type: "task.label_added";
      workspaceId: string;
      projectId: string;
      taskId: string;
      actorId: string;
      labelId: string;
    };

function triggerMatches(trigger: Trigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false;
  if (trigger.type === "task.created") return true;
  if (trigger.type === "task.moved") {
    if (event.type !== "task.moved") return false;
    return !trigger.params.toColumnId || trigger.params.toColumnId === event.toColumnId;
  }
  if (trigger.type === "task.label_added") {
    if (event.type !== "task.label_added") return false;
    return !trigger.params.labelId || trigger.params.labelId === event.labelId;
  }
  return false;
}

async function loadTaskCtx(workspaceId: string, taskId: string) {
  const [t] = await db
    .select({
      id: tasks.id,
      workspaceId: tasks.workspaceId,
      projectId: tasks.projectId,
      columnId: tasks.columnId,
      priority: tasks.priority,
      assigneeId: tasks.assigneeId,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!t || t.workspaceId !== workspaceId) return null;
  const labelRows = await db
    .select({ labelId: taskLabels.labelId })
    .from(taskLabels)
    .where(eq(taskLabels.taskId, taskId));
  return { ...t, labelIds: labelRows.map((r) => r.labelId) };
}

async function evaluateConditions(
  workspaceId: string,
  taskId: string,
  conditions: Condition[],
): Promise<boolean> {
  if (conditions.length === 0) return true;
  const ctx = await loadTaskCtx(workspaceId, taskId);
  if (!ctx) return false;
  for (const c of conditions) {
    switch (c.key) {
      case "column":
        if (ctx.columnId !== c.value) return false;
        break;
      case "priority":
        if (ctx.priority !== c.value) return false;
        break;
      case "has_label":
        if (!ctx.labelIds.includes(c.value)) return false;
        break;
      case "assignee":
        if (c.value === "none") {
          if (ctx.assigneeId !== null) return false;
        } else if (ctx.assigneeId !== c.value) {
          return false;
        }
        break;
    }
  }
  return true;
}

async function executeAction(
  workspaceId: string,
  taskId: string,
  actorId: string,
  action: AutomationAction,
): Promise<void> {
  // Динамические импорты — services-цепочка циркулярна (tasks→automations,
  // automations→tasks/labels/comments). Динамический import убирает цикл на
  // уровне модулей.
  switch (action.type) {
    case "set_priority": {
      const { setPriority } = await import("@/services/tasks");
      await setPriority(workspaceId, taskId, action.params.priority);
      return;
    }
    case "set_color": {
      const { setColor } = await import("@/services/tasks");
      if (!isLabelColor(action.params.color)) throw new Error("Unknown color");
      await setColor(workspaceId, taskId, action.params.color as LabelColorSlug);
      return;
    }
    case "add_label": {
      const { attach } = await import("@/services/labels");
      await attach(workspaceId, taskId, action.params.labelId);
      return;
    }
    case "assign_to": {
      const { setAssignee } = await import("@/services/tasks");
      await setAssignee(workspaceId, taskId, action.params.userId);
      return;
    }
    case "move_to_column": {
      const { move } = await import("@/services/tasks");
      // Вставляем в начало целевой колонки (beforeKey=null, afterKey=null → keyBetween добавит ключ).
      // Чтобы вставить в начало, нужен только afterKey (первая задача), но проще передать null,null.
      // services/tasks.move сам разберётся.
      const { db: appDb } = await import("@/db");
      const { tasks: tasksTbl } = await import("@/db/schema/tasks");
      const { eq: eqOp, asc: ascOp } = await import("drizzle-orm");
      const [first] = await appDb
        .select({ orderKey: tasksTbl.orderKey })
        .from(tasksTbl)
        .where(eqOp(tasksTbl.columnId, action.params.columnId))
        .orderBy(ascOp(tasksTbl.orderKey))
        .limit(1);
      await move(workspaceId, taskId, action.params.columnId, null, first?.orderKey ?? null);
      return;
    }
    case "mark_complete": {
      const { setCompleted } = await import("@/services/tasks");
      await setCompleted(workspaceId, taskId, true);
      return;
    }
    case "add_comment": {
      const { create } = await import("@/services/comments");
      await create(workspaceId, taskId, actorId, action.params.text);
      return;
    }
  }
}

/**
 * Подбирает enabled-правила, у которых триггер совпадает с событием, проверяет
 * условия и запускает действия. Каждое действие — независимая транзакция:
 * сбой одного не откатывает остальные, ошибка лога идёт в automation_runs.
 *
 * Anti-loop: depth трекается через AsyncLocalStorage. Если глубина превышает
 * MAX_DEPTH, runAutomations выходит без работы. Это позволяет правилу,
 * которое ставит метку, безопасно триггерить другое правило — но цикл A↔B
 * остановится на 3-й итерации.
 */
export async function runAutomations(event: AutomationEvent): Promise<void> {
  const depth = currentDepth();
  if (depth >= MAX_DEPTH) return;
  const rules = await db
    .select()
    .from(automations)
    .where(
      and(
        eq(automations.projectId, event.projectId),
        eq(automations.enabled, true),
      ),
    );
  if (rules.length === 0) return;

  await als.run({ depth: depth + 1 }, async () => {
    for (const raw of rules) {
      const rule = parseRow(raw);
      if (!rule) continue;
      if (!triggerMatches(rule.trigger, event)) continue;
      const condOk = await evaluateConditions(event.workspaceId, event.taskId, rule.conditions);
      if (!condOk) {
        await recordRun(rule.id, event.taskId, "skipped", { actionsRun: 0 });
        continue;
      }
      let actionsRun = 0;
      const errors: string[] = [];
      for (const action of rule.actions) {
        try {
          await executeAction(event.workspaceId, event.taskId, event.actorId, action);
          actionsRun += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${action.type}: ${msg}`);
          // не прерываем — каждое действие независимо
        }
      }
      await recordRun(
        rule.id,
        event.taskId,
        errors.length > 0 ? "error" : "success",
        { actionsRun, errors: errors.length > 0 ? errors : undefined },
      );
    }
  });
}

async function recordRun(
  automationId: string,
  taskId: string,
  status: "success" | "error" | "skipped",
  details: { actionsRun: number; errors?: string[] },
): Promise<void> {
  try {
    await db.insert(automationRuns).values({
      id: newId(),
      automationId,
      taskId,
      status,
      details: JSON.stringify(details),
    });
  } catch {
    // не валим всё на логе — это последний шаг
  }
}

// Реэкспорт для backward-compat.
export { RuleSchema, type Rule };

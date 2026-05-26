import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { customFieldDefs, customFieldValues } from "@/db/schema/custom-fields";
import {
  FIELD_TYPES,
  type FieldDef,
  type FieldType,
  type SelectOption,
} from "@/domain/custom-fields";
import { keyBetween } from "@/domain/ordering";
import { newId } from "@/lib/ids";

// Реэкспорт для backward-compat: server-импортёрам не приходится менять путь.
export { FIELD_TYPES };
export type { FieldDef, FieldType, SelectOption };

function isFieldType(value: string): value is FieldType {
  return (FIELD_TYPES as readonly string[]).includes(value);
}

function parseOptions(raw: string | null): SelectOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is SelectOption =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as Record<string, unknown>).value === "string" &&
          typeof (x as Record<string, unknown>).label === "string",
      )
      .map((x) => ({ value: x.value, label: x.label }));
  } catch {
    return [];
  }
}

function rowToDef(r: typeof customFieldDefs.$inferSelect): FieldDef {
  return {
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    type: isFieldType(r.type) ? r.type : "text",
    options: parseOptions(r.options),
    required: r.required,
    orderKey: r.orderKey,
  };
}

export async function listForProject(projectId: string): Promise<FieldDef[]> {
  const rows = await db
    .select()
    .from(customFieldDefs)
    .where(eq(customFieldDefs.projectId, projectId))
    .orderBy(asc(customFieldDefs.orderKey));
  return rows.map(rowToDef);
}

async function assertDefInWorkspace(
  workspaceId: string,
  defId: string,
): Promise<{ projectId: string; type: FieldType; options: SelectOption[] }> {
  const [row] = await db
    .select()
    .from(customFieldDefs)
    .where(eq(customFieldDefs.id, defId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) throw new Error("Field not in workspace");
  return {
    projectId: row.projectId,
    type: isFieldType(row.type) ? row.type : "text",
    options: parseOptions(row.options),
  };
}

export type CreateDefInput = {
  workspaceId: string;
  projectId: string;
  name: string;
  type: FieldType;
  options?: SelectOption[];
  required?: boolean;
};

export async function createDef(input: CreateDefInput): Promise<FieldDef> {
  const [last] = await db
    .select({ orderKey: customFieldDefs.orderKey })
    .from(customFieldDefs)
    .where(eq(customFieldDefs.projectId, input.projectId))
    .orderBy(desc(customFieldDefs.orderKey))
    .limit(1);
  const orderKey = keyBetween(last?.orderKey ?? null, null);
  const id = newId();
  const options = input.type === "select" ? input.options ?? [] : [];
  await db.insert(customFieldDefs).values({
    id,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    name: input.name,
    type: input.type,
    options: options.length > 0 ? JSON.stringify(options) : null,
    required: input.required ?? false,
    orderKey,
  });
  return {
    id,
    projectId: input.projectId,
    name: input.name,
    type: input.type,
    options,
    required: input.required ?? false,
    orderKey,
  };
}

export type UpdateDefInput = {
  name?: string;
  options?: SelectOption[];
  required?: boolean;
};

export async function updateDef(
  workspaceId: string,
  defId: string,
  patch: UpdateDefInput,
): Promise<void> {
  await assertDefInWorkspace(workspaceId, defId);
  const set: Partial<typeof customFieldDefs.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.required !== undefined) set.required = patch.required;
  if (patch.options !== undefined) {
    set.options = patch.options.length > 0 ? JSON.stringify(patch.options) : null;
  }
  await db.update(customFieldDefs).set(set).where(eq(customFieldDefs.id, defId));
}

export async function removeDef(workspaceId: string, defId: string): Promise<void> {
  await assertDefInWorkspace(workspaceId, defId);
  await db.delete(customFieldDefs).where(eq(customFieldDefs.id, defId));
}

export async function moveDef(
  workspaceId: string,
  defId: string,
  direction: "up" | "down",
): Promise<void> {
  const { projectId } = await assertDefInWorkspace(workspaceId, defId);
  const all = await db
    .select({ id: customFieldDefs.id, orderKey: customFieldDefs.orderKey })
    .from(customFieldDefs)
    .where(eq(customFieldDefs.projectId, projectId))
    .orderBy(asc(customFieldDefs.orderKey));
  const idx = all.findIndex((r) => r.id === defId);
  if (idx < 0) return;
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= all.length) return;
  // Меняем местами keys. Это проще, чем считать keyBetween соседей.
  const a = all[idx];
  const b = all[swapWith];
  await db.transaction(async (tx) => {
    await tx
      .update(customFieldDefs)
      .set({ orderKey: b.orderKey })
      .where(eq(customFieldDefs.id, a.id));
    await tx
      .update(customFieldDefs)
      .set({ orderKey: a.orderKey })
      .where(eq(customFieldDefs.id, b.id));
  });
}

/**
 * Возвращает текущие значения для задачи в формате `field_id → value_text`.
 * Удалённые def'ы не возвращаются (т.к. JOIN не найдёт def).
 */
export async function getValuesForTask(
  workspaceId: string,
  taskId: string,
): Promise<Record<string, string>> {
  const rows = await db
    .select({
      fieldId: customFieldValues.fieldId,
      valueText: customFieldValues.valueText,
      workspaceId: customFieldDefs.workspaceId,
    })
    .from(customFieldValues)
    .innerJoin(customFieldDefs, eq(customFieldDefs.id, customFieldValues.fieldId))
    .where(eq(customFieldValues.taskId, taskId));
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.workspaceId !== workspaceId) continue;
    if (r.valueText !== null) out[r.fieldId] = r.valueText;
  }
  return out;
}

/**
 * Аналог `getValuesForTask`, но для пачки задач. Один запрос.
 */
export async function getValuesForTasks(
  workspaceId: string,
  taskIds: string[],
): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>();
  if (taskIds.length === 0) return out;
  const rows = await db
    .select({
      taskId: customFieldValues.taskId,
      fieldId: customFieldValues.fieldId,
      valueText: customFieldValues.valueText,
      workspaceId: customFieldDefs.workspaceId,
    })
    .from(customFieldValues)
    .innerJoin(customFieldDefs, eq(customFieldDefs.id, customFieldValues.fieldId))
    .where(inArray(customFieldValues.taskId, taskIds));
  for (const r of rows) {
    if (r.workspaceId !== workspaceId) continue;
    if (r.valueText === null) continue;
    let bucket = out.get(r.taskId);
    if (!bucket) {
      bucket = {};
      out.set(r.taskId, bucket);
    }
    bucket[r.fieldId] = r.valueText;
  }
  return out;
}

export type SetValueError = "invalid_type" | "unknown_option" | "invalid_url" | "invalid_number" | "invalid_date";

function validateValue(
  type: FieldType,
  options: SelectOption[],
  raw: string,
): { ok: true; value: string | null } | { ok: false; error: SetValueError } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };

  switch (type) {
    case "text":
      return { ok: true, value: trimmed.slice(0, 1000) };
    case "url": {
      try {
        // ловит и невалидные, и не-http URL'ы
        const u = new URL(trimmed);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          return { ok: false, error: "invalid_url" };
        }
        return { ok: true, value: trimmed };
      } catch {
        return { ok: false, error: "invalid_url" };
      }
    }
    case "number": {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return { ok: false, error: "invalid_number" };
      return { ok: true, value: String(n) };
    }
    case "date": {
      // ISO-дата YYYY-MM-DD или полноценная ISO
      const d = new Date(trimmed);
      if (Number.isNaN(d.getTime())) return { ok: false, error: "invalid_date" };
      return { ok: true, value: trimmed };
    }
    case "select": {
      if (!options.some((o) => o.value === trimmed)) {
        return { ok: false, error: "unknown_option" };
      }
      return { ok: true, value: trimmed };
    }
    case "checkbox":
      return { ok: true, value: trimmed === "true" ? "true" : "false" };
    default:
      return { ok: false, error: "invalid_type" };
  }
}

export async function setValue(
  workspaceId: string,
  taskId: string,
  fieldId: string,
  rawValue: string,
): Promise<{ ok: true } | { ok: false; error: SetValueError }> {
  const def = await assertDefInWorkspace(workspaceId, fieldId);
  const validated = validateValue(def.type, def.options, rawValue);
  if (!validated.ok) return validated;

  if (validated.value === null) {
    await db
      .delete(customFieldValues)
      .where(
        and(
          eq(customFieldValues.taskId, taskId),
          eq(customFieldValues.fieldId, fieldId),
        ),
      );
    return { ok: true };
  }

  // SQLite UPSERT через ON CONFLICT.
  await db
    .insert(customFieldValues)
    .values({
      taskId,
      fieldId,
      valueText: validated.value,
    })
    .onConflictDoUpdate({
      target: [customFieldValues.taskId, customFieldValues.fieldId],
      set: { valueText: validated.value, updatedAt: new Date() },
    });
  return { ok: true };
}

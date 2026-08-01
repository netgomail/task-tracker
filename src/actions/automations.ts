"use server";

import { revalidatePath } from "next/cache";

import { RuleSchema, type Rule, type AutomationRow } from "@/domain/automations";
import { authorizeProject, type ActionResult } from "@/actions/_shared";
import * as automations from "@/services/automations";

export type { ActionResult };

function validateRule(input: unknown): { ok: true; rule: Rule } | { ok: false; error: string } {
  const parsed = RuleSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Неверное правило" };
  }
  return { ok: true, rule: parsed.data };
}

export type SerializedAutomation = Omit<AutomationRow, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export async function listAutomationsAction(
  wsSlug: string,
  projectSlug: string,
): Promise<
  | { ok: true; rules: SerializedAutomation[] }
  | { ok: false; error: string }
> {
  const auth = await authorizeProject(wsSlug, projectSlug, "viewer");
  if (!auth.ok) return auth;
  try {
    const { project } = auth;
    const rules = await automations.listForProject(project.id);
    return {
      ok: true,
      rules: rules.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export async function createAutomationAction(
  wsSlug: string,
  projectSlug: string,
  rule: unknown,
): Promise<ActionResult> {
  const auth = await authorizeProject(wsSlug, projectSlug, "admin");
  if (!auth.ok) return auth;
  const { session, ws, project } = auth;
  const validated = validateRule(rule);
  if (!validated.ok) return validated;
  await automations.createRule({
    workspaceId: ws.workspaceId,
    projectId: project.id,
    createdBy: session.user.id,
    rule: validated.rule,
  });
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  return { ok: true };
}

export async function updateAutomationAction(
  wsSlug: string,
  projectSlug: string,
  ruleId: string,
  rule: unknown,
): Promise<ActionResult> {
  const auth = await authorizeProject(wsSlug, projectSlug, "admin");
  if (!auth.ok) return auth;
  const { ws } = auth;
  const validated = validateRule(rule);
  if (!validated.ok) return validated;
  await automations.updateRule(ws.workspaceId, ruleId, validated.rule);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  return { ok: true };
}

export async function toggleAutomationAction(
  wsSlug: string,
  projectSlug: string,
  ruleId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const auth = await authorizeProject(wsSlug, projectSlug, "admin");
  if (!auth.ok) return auth;
  const { ws } = auth;
  await automations.setEnabled(ws.workspaceId, ruleId, enabled);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  return { ok: true };
}

export async function deleteAutomationAction(
  wsSlug: string,
  projectSlug: string,
  ruleId: string,
): Promise<ActionResult> {
  const auth = await authorizeProject(wsSlug, projectSlug, "admin");
  if (!auth.ok) return auth;
  const { ws } = auth;
  await automations.removeRule(ws.workspaceId, ruleId);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  return { ok: true };
}

export type SerializedRun = {
  id: string;
  status: "success" | "error" | "skipped";
  details: { actionsRun?: number; errors?: string[] } | null;
  createdAt: string;
};

export async function listAutomationRunsAction(
  wsSlug: string,
  projectSlug: string,
  ruleId: string,
): Promise<{ ok: true; runs: SerializedRun[] } | { ok: false; error: string }> {
  const auth = await authorizeProject(wsSlug, projectSlug, "viewer");
  if (!auth.ok) return auth;
  try {
    const { ws } = auth;
    const runs = await automations.listRecentRuns(ws.workspaceId, ruleId);
    return {
      ok: true,
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        details: r.details,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка" };
  }
}

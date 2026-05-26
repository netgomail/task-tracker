"use server";

import { revalidatePath } from "next/cache";

import { RuleSchema, type Rule, type AutomationRow } from "@/domain/automations";
import { hasRole, requireUser } from "@/lib/rbac";
import * as automations from "@/services/automations";
import { getBySlug as getWorkspaceBySlug } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function authorize(wsSlug: string, projectSlug: string) {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) throw new Error("Workspace not found");
  const project = await getProjectBySlug(ws.workspaceId, projectSlug);
  if (!project) throw new Error("Project not found");
  return { session, ws, project };
}

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
  try {
    const { project } = await authorize(wsSlug, projectSlug);
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
  const { session, ws, project } = await authorize(wsSlug, projectSlug);
  if (!hasRole(ws.role, "admin")) {
    return { ok: false, error: "Автоматизации может настраивать только админ" };
  }
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
  const { ws } = await authorize(wsSlug, projectSlug);
  if (!hasRole(ws.role, "admin")) {
    return { ok: false, error: "Автоматизации может настраивать только админ" };
  }
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
  const { ws } = await authorize(wsSlug, projectSlug);
  if (!hasRole(ws.role, "admin")) {
    return { ok: false, error: "Автоматизации может настраивать только админ" };
  }
  await automations.setEnabled(ws.workspaceId, ruleId, enabled);
  revalidatePath(`/w/${wsSlug}/p/${projectSlug}`);
  return { ok: true };
}

export async function deleteAutomationAction(
  wsSlug: string,
  projectSlug: string,
  ruleId: string,
): Promise<ActionResult> {
  const { ws } = await authorize(wsSlug, projectSlug);
  if (!hasRole(ws.role, "admin")) {
    return { ok: false, error: "Автоматизации может настраивать только админ" };
  }
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
  try {
    const { ws } = await authorize(wsSlug, projectSlug);
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

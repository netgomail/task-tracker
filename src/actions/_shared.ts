import "server-only";

import { requireUser, hasRole, type AppSession } from "@/lib/rbac";
import { getBySlug as getWorkspaceBySlug, type WorkspaceMembership } from "@/services/membership";
import { getBySlug as getProjectBySlug } from "@/services/projects";
import type { MembershipRole } from "@/domain/types";

/** Единый результат server actions: клиенты показывают error в toast. */
export type ActionResult = { ok: true } | { ok: false; error: string };

export type AuthFailure = { ok: false; error: string };

export type WorkspaceAuth = { ok: true; session: AppSession; ws: WorkspaceMembership };

/**
 * Авторизация экшена в рамках workspace. Не бросает: неуспех возвращается
 * как { ok:false } и уходит в toast — throw из экшена превращался бы у
 * клиента в неотловленный digest-500.
 *
 * `atLeast` — минимальная роль. По умолчанию "member": все мутации закрыты
 * от роли viewer («Наблюдатель»). Для чтения передавать "viewer" явно.
 */
export async function authorizeWorkspace(
  wsSlug: string,
  atLeast: MembershipRole = "member",
): Promise<WorkspaceAuth | AuthFailure> {
  const session = await requireUser();
  const ws = await getWorkspaceBySlug(session.user.id, wsSlug);
  if (!ws) return { ok: false, error: "Пространство не найдено" };
  if (!hasRole(ws.role, atLeast)) return { ok: false, error: "Недостаточно прав" };
  return { ok: true, session, ws };
}

type ProjectInfo = NonNullable<Awaited<ReturnType<typeof getProjectBySlug>>>;

export type ProjectAuth = WorkspaceAuth & { project: ProjectInfo };

/** То же, плюс проект по slug в рамках workspace. */
export async function authorizeProject(
  wsSlug: string,
  projectSlug: string,
  atLeast: MembershipRole = "member",
): Promise<ProjectAuth | AuthFailure> {
  const auth = await authorizeWorkspace(wsSlug, atLeast);
  if (!auth.ok) return auth;
  const project = await getProjectBySlug(auth.ws.workspaceId, projectSlug);
  if (!project) return { ok: false, error: "Проект не найден" };
  return { ...auth, project };
}

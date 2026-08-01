import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import type { MembershipRole } from "@/domain/types";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
};

export type AppSession = {
  user: SessionUser;
  activeOrganizationId: string | null;
};

export async function getSession(): Promise<AppSession | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
    },
    activeOrganizationId: session.session.activeOrganizationId ?? null,
  };
}

/**
 * Use in Server Components / Server Actions that require an authenticated user.
 * Redirects to /login when no session is present.
 */
export async function requireUser(): Promise<AppSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

const ROLE_RANK: Record<MembershipRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

/**
 * Ролевая проверка. Мутации из server actions идут через
 * actions/_shared.authorizeWorkspace, где минимальная роль — "member":
 * роль viewer («Наблюдатель») read-only.
 */
export function hasRole(actual: MembershipRole, atLeast: MembershipRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[atLeast];
}

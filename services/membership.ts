import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { member, organization, user } from "@/db/schema/auth";
import { MEMBERSHIP_ROLES, type MembershipRole } from "@/domain/types";

export type WorkspaceMembership = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: MembershipRole;
};

function isKnownRole(value: string): value is MembershipRole {
  return (MEMBERSHIP_ROLES as readonly string[]).includes(value);
}

export async function getBySlug(
  userId: string,
  slug: string,
): Promise<WorkspaceMembership | null> {
  const [row] = await db
    .select({
      workspaceId: organization.id,
      workspaceName: organization.name,
      workspaceSlug: organization.slug,
      role: member.role,
    })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .where(and(eq(organization.slug, slug), eq(member.userId, userId)))
    .limit(1);

  if (!row) return null;
  const role: MembershipRole = isKnownRole(row.role) ? row.role : "member";
  return { ...row, role };
}

export type WorkspaceMember = {
  id: string;
  name: string;
  image: string | null;
  role: MembershipRole;
};

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, workspaceId))
    .orderBy(asc(user.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    image: r.image ?? null,
    role: isKnownRole(r.role) ? r.role : "member",
  }));
}

export async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, userId)))
    .limit(1);
  return Boolean(row);
}

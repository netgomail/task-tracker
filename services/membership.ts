import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { member, organization } from "@/db/schema/auth";
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

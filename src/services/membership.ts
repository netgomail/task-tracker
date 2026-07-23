import "server-only";

import { headers } from "next/headers";
import { and, asc, notInArray } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { member, organization, user } from "@/db/schema/auth";
import { MEMBERSHIP_ROLES, type MembershipRole } from "@/domain/types";
import { eq } from "drizzle-orm";

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
  memberId: string;
  name: string;
  image: string | null;
  role: MembershipRole;
};

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const rows = await db
    .select({
      id: user.id,
      memberId: member.id,
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
    memberId: r.memberId,
    name: r.name,
    image: r.image ?? null,
    role: isKnownRole(r.role) ? r.role : "member",
  }));
}

export async function updateMemberRole(
  workspaceId: string,
  memberId: string,
  role: MembershipRole,
): Promise<void> {
  await db
    .update(member)
    .set({ role })
    .where(and(eq(member.id, memberId), eq(member.organizationId, workspaceId)));
}

export async function removeMember(workspaceId: string, memberId: string): Promise<void> {
  await db
    .delete(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, workspaceId)));
}

export async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export type AddableUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

/** Пользователи системы, которых ещё можно добавить в это пространство. */
export async function listAddableUsers(workspaceId: string): Promise<AddableUser[]> {
  const existing = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, workspaceId));
  const existingIds = existing.map((r) => r.userId);

  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, image: user.image })
    .from(user)
    .where(existingIds.length > 0 ? notInArray(user.id, existingIds) : undefined)
    .orderBy(asc(user.name));

  return rows.map((r) => ({ ...r, image: r.image ?? null }));
}

export async function addMember(
  workspaceId: string,
  userId: string,
  role: MembershipRole,
): Promise<WorkspaceMember> {
  const [target] = await db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) throw new Error("Пользователь не найден");
  if (await isMember(workspaceId, target.id)) {
    throw new Error("Этот пользователь уже состоит в пространстве");
  }
  const hdrs = await headers();
  const created = await auth.api.addMember({
    headers: hdrs,
    body: {
      userId: target.id,
      // "viewer" — роль этого приложения поверх plain-text колонки member.role;
      // better-auth типизирует roles по своим дефолтам (owner/admin/member) и не знает о ней.
      role: role as unknown as "owner" | "admin" | "member",
      organizationId: workspaceId,
    },
  });
  if (!created) throw new Error("Не удалось добавить участника");
  return {
    id: target.id,
    memberId: created.id,
    name: target.name,
    image: target.image ?? null,
    role,
  };
}

import "server-only";

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { member, organization } from "@/db/schema/auth";
import { shortSlug } from "@/lib/ids";
import { slugify, withRandomSuffix } from "@/lib/slug";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  createdAt: Date;
  role: string;
};

export async function listForUser(userId: string): Promise<Workspace[]> {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      createdAt: organization.createdAt,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId));

  return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt) }));
}

export async function create(name: string): Promise<Workspace> {
  const hdrs = await headers();
  const baseSlug = slugify(name);
  const slug = withRandomSuffix(baseSlug, shortSlug());
  const org = await auth.api.createOrganization({
    headers: hdrs,
    body: { name, slug },
  });
  if (!org) throw new Error("Failed to create workspace");
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logo: org.logo ?? null,
    createdAt: new Date(org.createdAt),
    role: "owner",
  };
}

/**
 * If the user has no workspaces yet — create a default "Personal" one and
 * make it active. Returns the workspaces list (post-creation if applicable).
 */
export async function ensurePersonal(userId: string, fallbackName: string): Promise<Workspace[]> {
  const existing = await listForUser(userId);
  if (existing.length > 0) return existing;
  await create(fallbackName);
  return listForUser(userId);
}

export async function remove(workspaceId: string): Promise<void> {
  const hdrs = await headers();
  await auth.api.deleteOrganization({
    headers: hdrs,
    body: { organizationId: workspaceId },
  });
}

export async function rename(workspaceId: string, name: string): Promise<void> {
  await db.update(organization).set({ name }).where(eq(organization.id, workspaceId));
}

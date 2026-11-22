import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "../db";
import { groupMembers, groups, users } from "../db/schema";
import { requireUser } from "../auth/current";

export type MiniUser = { id: string; name: string; image: string | null; isBot: boolean };

export const miniUserCols = { id: users.id, name: users.name, image: users.image, isBot: users.isBot };

export async function usersById(ids: string[]): Promise<Map<string, MiniUser>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const rows = await db.select(miniUserCols).from(users).where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function membership(groupId: string, userId: string) {
  return db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .get();
}

/** Resolves the signed-in user and the group, or 404s if they aren't a member. */
export async function requireMember(groupId: string) {
  const user = await requireUser();
  const group = await db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!group) notFound();
  const m = await membership(groupId, user.id);
  if (!m) notFound();
  return { user, group, role: m.role };
}

export async function myGroupIds(userId: string): Promise<string[]> {
  const rows = await db.select({ id: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, userId));
  return rows.map((r) => r.id);
}

export async function groupMemberList(groupId: string) {
  return db
    .select({ ...miniUserCols, role: groupMembers.role, joinedAt: groupMembers.joinedAt })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(groupMembers.joinedAt);
}

import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db, type DB } from "../db";
import { activity, bets, type ActivityType } from "../db/schema";
import { newId } from "../ids";
import { usersById } from "./common";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export async function logActivity(
  e: { groupId: string; betId?: string | null; actorId?: string | null; type: ActivityType; data?: Record<string, unknown> },
  tx: DB | Tx = db,
) {
  await tx.insert(activity).values({
    id: newId(),
    groupId: e.groupId,
    betId: e.betId ?? null,
    actorId: e.actorId ?? null,
    type: e.type,
    data: e.data ?? null,
  });
}

export async function recentActivity(groupIds: string[], limit = 30) {
  if (groupIds.length === 0) return [];
  const rows = await db
    .select({
      id: activity.id,
      groupId: activity.groupId,
      betId: activity.betId,
      actorId: activity.actorId,
      type: activity.type,
      data: activity.data,
      createdAt: activity.createdAt,
      betTitle: bets.title,
    })
    .from(activity)
    .leftJoin(bets, eq(bets.id, activity.betId))
    .where(inArray(activity.groupId, groupIds))
    .orderBy(desc(activity.createdAt))
    .limit(limit);
  const people = await usersById(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)));
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.getTime(),
    actor: r.actorId ? (people.get(r.actorId) ?? null) : null,
  }));
}

export async function groupActivity(groupId: string, limit = 30) {
  return recentActivity([groupId], limit).then((rows) => rows.filter((r) => r.groupId === groupId));
}


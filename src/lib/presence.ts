import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";

/** Open app tabs send a heartbeat every minute while visible; two missed beats means gone. */
export const HEARTBEAT_MS = 60_000;
export const ONLINE_MS = 2 * 60_000;

export const isOnline = (lastSeenAt: Date | number | null | undefined, now = Date.now()) =>
  lastSeenAt != null && now - new Date(lastSeenAt).getTime() < ONLINE_MS;

/** Record that this person has the app open. Skips the write if they were seen in the last 30s. */
export async function touchPresence(userId: string) {
  const now = new Date();
  await db
    .update(users)
    .set({ lastSeenAt: now })
    .where(and(eq(users.id, userId), or(isNull(users.lastSeenAt), lt(users.lastSeenAt, new Date(now.getTime() - 30_000)))));
}

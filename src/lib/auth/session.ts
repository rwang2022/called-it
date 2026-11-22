import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { pushSubscriptions, sessions, users, type User } from "../db/schema";
import { newSessionToken } from "../ids";
import { DAY } from "../engine/rules";

export const SESSION_COOKIE = "ci_session";
export const SESSION_TTL_MS = 30 * DAY;
const RENEW_WITHIN_MS = 15 * DAY;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The stored session id for a raw token (its hash). */
export const sessionIdOf = hashToken;

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(userId: string) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export type SessionUser = Pick<User, "id" | "name" | "email" | "image" | "isBot">;

/** Returns the user for a raw session token, sliding the expiry forward when it gets close. */
export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  if (!/^[0-9a-z]{32}$/.test(token)) return null;
  const id = hashToken(token);
  const row = await db
    .select({
      expiresAt: sessions.expiresAt,
      user: { id: users.id, name: users.name, email: users.email, image: users.image, isBot: users.isBot },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .get();
  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (row.expiresAt.getTime() - now < RENEW_WITHIN_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(now + SESSION_TTL_MS) })
      .where(eq(sessions.id, id));
  }
  return row.user;
}

export const RECENT_SIGN_IN_MS = 15 * 60 * 1000;

/**
 * True when the session behind `token` was created in the last 15 minutes.
 * Sessions only slide once they're 15+ days old, so a fresh one still has
 * (almost) its full 30-day lifetime ahead of it.
 */
export async function isRecentSignIn(token: string | undefined) {
  if (!token || !/^[0-9a-z]{32}$/.test(token)) return false;
  const row = await db.select({ expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.id, hashToken(token))).get();
  return Boolean(row && row.expiresAt.getTime() >= Date.now() + SESSION_TTL_MS - RECENT_SIGN_IN_MS);
}

/** Sign-out: end the session and silence push on the device that used it. */
export async function invalidateSessionToken(token: string) {
  const id = hashToken(token);
  await db.batch([
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.sessionId, id)),
    db.delete(sessions).where(eq(sessions.id, id)),
  ]);
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback = "/home") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

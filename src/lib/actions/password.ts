"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { pushSubscriptions, sessions, users } from "../db/schema";
import { newId } from "../ids";
import { SESSION_COOKIE, createSession, isRecentSignIn, safeNext, sessionCookieOptions, sessionIdOf } from "../auth/session";
import {
  LIMITS,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_RE,
  clearFailures,
  dummyHash,
  hashPassword,
  normalizeUsername,
  recordFailure,
  throttled,
  verifyPassword,
} from "../auth/password";
import { actionUser, fail, run } from "./result";

const username = z
  .string()
  .transform(normalizeUsername)
  .refine((u) => USERNAME_RE.test(u), "Usernames are 3–24 letters, numbers, dots or underscores.");
const password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, "That password is too long.");

/** The caller's address as Vercel reports it (the platform overwrites client-sent values). */
async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

async function startSession(userId: string, next: string | undefined) {
  const { token, expiresAt } = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  redirect(safeNext(next));
}

const SignIn = z.object({ username: z.string().max(64), password: z.string().max(PASSWORD_MAX), next: z.string().optional() });

export async function signInWithPassword(input: z.input<typeof SignIn>) {
  return run(async () => {
    const p = SignIn.parse(input);
    const name = normalizeUsername(p.username);
    const userKey = `u:${name}`;
    const ipKey = `ip:${await clientIp()}`;
    if ((await throttled(userKey, LIMITS.user)) || (await throttled(ipKey, LIMITS.ip))) {
      fail("Too many attempts. Wait 15 minutes, or sign in with Google.");
    }
    const user = USERNAME_RE.test(name)
      ? await db.select({ id: users.id, hash: users.passwordHash }).from(users).where(eq(users.username, name)).get()
      : undefined;
    // Always run one scrypt so unknown usernames take as long as wrong passwords.
    const ok = await verifyPassword(p.password, user?.hash ?? (await dummyHash()));
    if (!user?.hash || !ok) {
      await Promise.all([recordFailure(userKey), recordFailure(ipKey)]);
      fail("That username and password don't match.");
    }
    await clearFailures(userKey);
    await startSession(user.id, p.next);
  });
}

const SignUp = z.object({
  username,
  name: z.string().trim().min(1, "Add your name.").max(60),
  password,
  next: z.string().optional(),
});

export async function signUpWithPassword(input: z.input<typeof SignUp>) {
  return run(async () => {
    const p = SignUp.parse(input);
    const ipKey = `su:${await clientIp()}`;
    if (await throttled(ipKey, LIMITS.signup)) fail("Too many new accounts from here. Try again in 15 minutes.");
    const taken = await db.select({ id: users.id }).from(users).where(eq(users.username, p.username)).get();
    if (taken) fail("That username is taken.");
    const id = newId();
    try {
      await db.insert(users).values({ id, username: p.username, name: p.name, passwordHash: await hashPassword(p.password) });
    } catch {
      fail("That username is taken."); // lost a race on the unique index
    }
    await recordFailure(ipKey); // counts sign-ups, not failures
    await startSession(id, p.next);
  });
}

const SetPassword = z.object({ username: username.optional(), current: z.string().max(PASSWORD_MAX).optional(), password });

/**
 * Add or change the signed-in user's username and password. Needs the current
 * password, or a sign-in from the last 15 minutes (that's how "forgot password"
 * works: sign in with Google, then set a new one). So a borrowed or stolen
 * session can't quietly add a way back in. Other devices are signed out afterwards.
 */
export async function setPassword(input: z.input<typeof SetPassword>) {
  return run(async () => {
    const me = await actionUser();
    if (me.isBot) fail("Not for bots.");
    const p = SetPassword.parse(input);
    const row = await db
      .select({ username: users.username, hash: users.passwordHash, googleSub: users.googleSub })
      .from(users)
      .where(eq(users.id, me.id))
      .get();
    if (!row) fail("Your session expired. Please sign in again.");

    const nextUsername = row.username ?? p.username;
    if (!nextUsername) fail("Pick a username first.");
    if (!row.username) {
      const taken = await db.select({ id: users.id }).from(users).where(eq(users.username, nextUsername)).get();
      if (taken) fail("That username is taken.");
    }
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (row.hash && p.current) {
      const key = `u:${row.username}`;
      if (await throttled(key, LIMITS.user)) fail("Too many attempts. Wait 15 minutes.");
      if (!(await verifyPassword(p.current, row.hash))) {
        await recordFailure(key);
        fail("Your current password isn't right.");
      }
    } else if (!(await isRecentSignIn(token))) {
      fail(row.hash ? "Enter your current password." : "For security, sign out and back in, then set your password within 15 minutes.");
    }

    try {
      await db.update(users).set({ username: nextUsername, passwordHash: await hashPassword(p.password) }).where(eq(users.id, me.id));
    } catch {
      fail("That username is taken.");
    }
    if (token) {
      const current = sessionIdOf(token);
      // Same as signing those devices out: end their sessions and silence their push.
      await db.batch([
        db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, me.id), ne(pushSubscriptions.sessionId, current))),
        db.delete(sessions).where(and(eq(sessions.userId, me.id), ne(sessions.id, current))),
      ]);
    }
    return { username: nextUsername };
  });
}

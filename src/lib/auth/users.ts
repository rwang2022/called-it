import "server-only";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { newId } from "../ids";

export type GoogleProfile = { sub: string; email: string; name: string; picture: string | null };

/** Find-or-create by Google subject, linking by verified email if the row predates Google sign-in. */
export async function upsertGoogleUser(p: GoogleProfile) {
  const email = p.email.toLowerCase();
  const name = p.name.trim().slice(0, 60) || email.split("@")[0];
  const bySub = await db.select().from(users).where(eq(users.googleSub, p.sub)).get();
  if (bySub) {
    await db.update(users).set({ name, image: p.picture, email }).where(eq(users.id, bySub.id));
    return bySub.id;
  }
  const byEmail = await db.select().from(users).where(eq(users.email, email)).get();
  if (byEmail) {
    await db.update(users).set({ googleSub: p.sub, name, image: p.picture }).where(eq(users.id, byEmail.id));
    return byEmail.id;
  }
  const id = newId();
  await db.insert(users).values({ id, googleSub: p.sub, email, name, image: p.picture });
  return id;
}

/**
 * Attach a Google account to an existing (password) user. Refuses if that Google
 * account or its email already belongs to someone else, so accounts never merge silently.
 */
export async function linkGoogleUser(userId: string, p: GoogleProfile) {
  const email = p.email.toLowerCase();
  const clash = await db
    .select({ id: users.id })
    .from(users)
    .where(and(ne(users.id, userId), or(eq(users.googleSub, p.sub), eq(users.email, email))))
    .get();
  if (clash) return false;
  const updated = await db
    .update(users)
    .set({ googleSub: p.sub, email, image: p.picture })
    .where(and(eq(users.id, userId), or(isNull(users.googleSub), eq(users.googleSub, p.sub))))
    .returning({ id: users.id });
  return updated.length > 0;
}

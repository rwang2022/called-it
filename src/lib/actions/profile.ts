"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { avatars, users } from "../db/schema";
import { actionUser, fail, run } from "./result";

/** Photos are resized to 256px in the browser first, so real ones are ~10–40 KB. */
const MAX_AVATAR_BYTES = 300 * 1024;

/** Identify the image from its first bytes; never trust the browser's claimed type. */
function sniffImage(b: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function profileUser() {
  const me = await actionUser();
  if (me.isBot) fail("Not for bots.");
  return me;
}

export async function updateName(name: string) {
  return run(async () => {
    const me = await profileUser();
    const clean = z.string().trim().min(1, "Add your name.").max(60, "Keep it under 60 characters.").parse(name);
    await db.update(users).set({ name: clean, nameEdited: true }).where(eq(users.id, me.id));
    refresh();
  });
}

export async function uploadAvatar(form: FormData) {
  return run(async () => {
    const me = await profileUser();
    const file = form.get("photo");
    if (!(file instanceof File)) fail("Choose a photo first.");
    if (file.size > MAX_AVATAR_BYTES) fail("That photo is too big.");
    const data = Buffer.from(await file.arrayBuffer());
    const contentType = sniffImage(data);
    if (!contentType) fail("Use a JPEG, PNG or WebP photo.");
    const now = new Date();
    await db.batch([
      db
        .insert(avatars)
        .values({ userId: me.id, contentType, data, updatedAt: now })
        .onConflictDoUpdate({ target: avatars.userId, set: { contentType, data, updatedAt: now } }),
      // A new ?v= per upload, so browsers (which cache the photo for a year) fetch the new one.
      db.update(users).set({ image: `/api/avatar/${me.id}?v=${now.getTime().toString(36)}`, imageEdited: true }).where(eq(users.id, me.id)),
    ]);
    refresh();
  });
}

/** Back to initials. Stays that way: Google sign-in won't put its photo back. */
export async function removeAvatar() {
  return run(async () => {
    const me = await profileUser();
    await db.batch([
      db.delete(avatars).where(eq(avatars.userId, me.id)),
      db.update(users).set({ image: null, imageEdited: true }).where(eq(users.id, me.id)),
    ]);
    refresh();
  });
}

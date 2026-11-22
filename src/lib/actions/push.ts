"use server";

import { and, asc, eq, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { db } from "../db";
import { pushSubscriptions } from "../db/schema";
import { SESSION_COOKIE, sessionIdOf } from "../auth/session";
import { copy } from "../notify/compose";
import { pushConfigured, sendDirect } from "../notify";
import { actionUser, fail, run } from "./result";

/**
 * Only the browsers' real push services. Anything else would let a user point
 * the server's outbound requests at an arbitrary URL.
 */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
const isPushService = (endpoint: string) => {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

const b64url = z.string().min(8).max(256).regex(/^[A-Za-z0-9_-]+=*$/);
const SubscriptionInput = z.object({
  endpoint: z.string().max(1024).refine(isPushService, "That browser's push service isn't supported."),
  keys: z.object({ p256dh: b64url, auth: b64url }),
});

const MAX_DEVICES = 10;

async function sessionId() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sessionIdOf(token) : null;
}

/** Register this browser for the signed-in user (moving it over if someone else had it). */
export async function subscribePush(input: z.input<typeof SubscriptionInput>) {
  return run(async () => {
    if (!pushConfigured()) fail("Notifications aren't set up on this server yet.");
    const user = await actionUser();
    const sub = SubscriptionInput.parse(input);
    const values = {
      userId: user.id,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      sessionId: await sessionId(),
      userAgent: (await headers()).get("user-agent")?.slice(0, 200) ?? null,
    };
    await db
      .insert(pushSubscriptions)
      .values({ endpoint: sub.endpoint, ...values })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
    // Keep the device list bounded: drop the oldest beyond the cap.
    const all = await db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id))
      .orderBy(asc(pushSubscriptions.createdAt));
    for (const old of all.slice(0, Math.max(0, all.length - MAX_DEVICES))) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, old.endpoint));
    }
  });
}

export async function unsubscribePush(endpoint: string) {
  return run(async () => {
    const user = await actionUser();
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, z.string().max(1024).parse(endpoint)), eq(pushSubscriptions.userId, user.id)));
  });
}

/**
 * Called when the app loads in a browser that already has a push subscription.
 * Returns whether it's on for the signed-in user. If it belongs to someone else
 * (a shared device whose last user never signed out), it's dropped so their
 * alerts stop showing up here.
 */
export async function syncPushSubscription(input: z.input<typeof SubscriptionInput>) {
  return run(async () => {
    const user = await actionUser();
    const sub = SubscriptionInput.safeParse(input);
    if (!sub.success) return { on: false, devices: 0 };
    const row = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.data.endpoint)).get();
    if (row && row.userId !== user.id) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, row.endpoint));
    } else if (row && (row.p256dh !== sub.data.keys.p256dh || row.auth !== sub.data.keys.auth)) {
      await db
        .update(pushSubscriptions)
        .set({ p256dh: sub.data.keys.p256dh, auth: sub.data.keys.auth })
        .where(eq(pushSubscriptions.endpoint, row.endpoint));
    }
    const others = await db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, user.id), ne(pushSubscriptions.endpoint, sub.data.endpoint)));
    const on = Boolean(row && row.userId === user.id);
    return { on, devices: others.length + (on ? 1 : 0) };
  });
}

/** Send a sample notification to all of the signed-in user's devices. */
export async function sendTestPush() {
  return run(async () => {
    if (!pushConfigured()) fail("Notifications aren't set up on this server yet.");
    const user = await actionUser();
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
    if (subs.length === 0) fail("Turn notifications on first.");
    const sent = await sendDirect(subs, copy.test());
    if (sent === 0) fail("Couldn't reach your device. Try turning notifications off and on again.");
    return sent;
  });
}

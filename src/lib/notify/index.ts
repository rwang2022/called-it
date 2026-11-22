import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import { sendNotification, WebPushError } from "web-push";
import { db } from "../db";
import { groupMembers, pushSubscriptions } from "../db/schema";
import { appUrl } from "../auth/current";
import { planDeliveries, type Notice, type NoticeKind, type PushPayload } from "./compose";

export type { PushPayload, NoticeKind } from "./compose";

export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const vapidPublicKey = () => (pushConfigured() ? process.env.VAPID_PUBLIC_KEY! : null);

function vapidDetails() {
  const subject = process.env.VAPID_SUBJECT?.trim();
  const site = appUrl();
  return {
    // Push services want a way to reach the sender. Apple rejects localhost here.
    subject: subject || (site.startsWith("https://") ? site : "mailto:notifications@example.com"),
    publicKey: process.env.VAPID_PUBLIC_KEY!,
    privateKey: process.env.VAPID_PRIVATE_KEY!,
  };
}

/**
 * Notices are produced lazily: an action queues a producer, and the producer
 * runs (reads recipients, builds copy) after the response is sent. That keeps
 * mutations fast and lets a producer see the final state of its action.
 */
type Producer = () => Promise<Notice[]> | Notice[];
type Batch = { actorId: string | null; producers: Producer[]; closed: boolean };

const batches = new AsyncLocalStorage<Batch>();

function liveBatch() {
  const b = batches.getStore();
  // `after()` callbacks can inherit a batch that has already been sent.
  return b && !b.closed ? b : null;
}

/**
 * Run `fn` as one notification batch: whatever it queues goes out together,
 * at most one push per person, never to `actorId`. Nested batches fold into the
 * outer one (a cron run is one batch), keeping their own actor. If `fn` throws,
 * nothing is sent.
 */
export async function withNotifications<T>(actorId: string | null, fn: () => Promise<T>): Promise<T> {
  const outer = liveBatch();
  const batch: Batch = { actorId, producers: [], closed: false };
  const result = await batches.run(batch, fn);
  batch.closed = true;
  if (outer) outer.producers.push(...batch.producers);
  else await dispatch(batch.producers);
  return result;
}

/** Queue a producer of notices in the current batch (or send right away when there isn't one). */
export function queueNotices(producer: Producer) {
  if (!pushConfigured()) return;
  const batch = liveBatch();
  const actorId = batch?.actorId ?? null;
  const stamped: Producer = async () => (await producer()).map((n) => ({ ...n, actorId: n.actorId ?? actorId }));
  if (batch) batch.producers.push(stamped);
  else void dispatch([stamped]);
}

/** Tell `userIds` about something in `groupId`. Batched with the rest of the current action. */
export function notify(
  userIds: Iterable<string>,
  notice: { groupId: string; kind: NoticeKind; subject: string; payload: PushPayload },
) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  queueNotices(() => ids.map((userId) => ({ userId, ...notice })));
}

async function dispatch(producers: Producer[]) {
  if (producers.length === 0 || !pushConfigured()) return;
  const job = async () => {
    try {
      const settled = await Promise.allSettled(producers.map((p) => p()));
      const notices: Notice[] = [];
      for (const s of settled) {
        if (s.status === "fulfilled") notices.push(...s.value);
        else console.error("notification producer failed", s.reason);
      }
      await deliver(notices);
    } catch (e) {
      console.error("push delivery failed", e);
    }
  };
  try {
    after(job);
  } catch {
    // Outside a request (scripts, tests): just do it now.
    await job();
  }
}

/** Respect membership, collapse per person, and push to each of their devices. */
export async function deliver(notices: Notice[]) {
  if (notices.length === 0) return { sent: 0 };
  const userIds = [...new Set(notices.map((n) => n.userId))];
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
  if (subs.length === 0) return { sent: 0 };
  const groupIds = [...new Set(notices.map((n) => n.groupId))];
  const members = await db
    .select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(inArray(groupMembers.groupId, groupIds), inArray(groupMembers.userId, userIds)));
  const isMember = new Set(members.map((m) => `${m.groupId}:${m.userId}`));
  const plan = planDeliveries(notices, (g, u) => isMember.has(`${g}:${u}`));
  const targets = subs.filter((s) => plan.has(s.userId));
  const results = await Promise.all(targets.map((s) => sendTo(s, plan.get(s.userId)!)));
  const ok = targets.filter((_, i) => results[i]).map((s) => s.endpoint);
  if (ok.length) {
    await db.update(pushSubscriptions).set({ lastSentAt: new Date() }).where(inArray(pushSubscriptions.endpoint, ok));
  }
  return { sent: ok.length };
}

type Sub = typeof pushSubscriptions.$inferSelect;

/** Push to the current user's own devices, bypassing batching (for "Send a test"). */
export async function sendDirect(subs: Sub[], payload: PushPayload) {
  const results = await Promise.all(subs.map((s) => sendTo(s, payload)));
  return results.filter(Boolean).length;
}

async function sendTo(sub: Sub, payload: PushPayload): Promise<boolean> {
  try {
    await sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { vapidDetails: vapidDetails(), TTL: 2 * 24 * 60 * 60, urgency: "normal", timeout: 10_000 },
    );
    return true;
  } catch (e) {
    if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
      // The browser unsubscribed or the subscription expired: forget it.
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
    } else {
      const status = e instanceof WebPushError ? `${e.statusCode} ${e.body}` : e;
      console.error("push send failed", new URL(sub.endpoint).host, status);
    }
    return false;
  }
}

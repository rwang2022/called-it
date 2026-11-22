"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { payments } from "../db/schema";
import { newId } from "../ids";
import { logActivity } from "../data/activity";
import { membership } from "../data/common";
import { withNotifications } from "../notify";
import { noticePaymentClaimed } from "../notify/events";
import { actionMember, actionUser, fail, run } from "./result";

const RecordInput = z.object({
  groupId: z.string(),
  counterpartyId: z.string(),
  direction: z.enum(["paid", "received"]),
  amountCents: z.number().int().min(1, "Enter an amount.").max(10_000_000),
  note: z.string().trim().max(140).nullable(),
});

/**
 * "I paid them" creates a pending payment the receiver must confirm.
 * "They paid me" is self-evidently true for the receiver, so it's confirmed at once.
 */
export async function recordPayment(input: z.input<typeof RecordInput>) {
  return run(async () => {
    const r = RecordInput.parse(input);
    const { user } = await actionMember(r.groupId);
    if (r.counterpartyId === user.id) fail("Pick someone other than yourself.");
    if (!(await membership(r.groupId, r.counterpartyId))) fail("They're not in this group.");
    const paid = r.direction === "paid";
    if (paid) {
      const dup = await db
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.groupId, r.groupId),
            eq(payments.fromId, user.id),
            eq(payments.toId, r.counterpartyId),
            eq(payments.status, "pending"),
          ),
        )
        .get();
      if (dup) fail("You already have a payment to them waiting for confirmation.");
    }
    const now = new Date();
    const id = newId();
    await db.insert(payments).values({
      id,
      groupId: r.groupId,
      fromId: paid ? user.id : r.counterpartyId,
      toId: paid ? r.counterpartyId : user.id,
      amountCents: r.amountCents,
      status: paid ? "pending" : "confirmed",
      createdById: user.id,
      note: r.note || null,
      resolvedAt: paid ? null : now,
    });
    await logActivity({
      groupId: r.groupId,
      actorId: user.id,
      type: paid ? "payment_recorded" : "payment_confirmed",
      data: { amountCents: r.amountCents, to: paid ? r.counterpartyId : user.id, from: paid ? user.id : r.counterpartyId },
    });
    if (paid) await withNotifications(user.id, async () => noticePaymentClaimed(id));
    refresh();
  });
}

export async function respondToPayment(paymentId: string, accept: boolean) {
  return run(async () => {
    const user = await actionUser();
    const p = await db.select().from(payments).where(eq(payments.id, paymentId)).get();
    if (!p || p.toId !== user.id) fail("Only the person who received it can confirm.");
    if (p.status !== "pending") fail("Already handled.");
    const updated = await db
      .update(payments)
      .set({ status: accept ? "confirmed" : "rejected", resolvedAt: new Date() })
      .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")))
      .returning({ id: payments.id });
    if (updated.length && accept) {
      await logActivity({
        groupId: p.groupId,
        actorId: user.id,
        type: "payment_confirmed",
        data: { amountCents: p.amountCents, from: p.fromId, to: p.toId },
      });
    }
    refresh();
  });
}

export async function cancelPayment(paymentId: string) {
  return run(async () => {
    const user = await actionUser();
    const p = await db.select().from(payments).where(eq(payments.id, paymentId)).get();
    if (!p || p.createdById !== user.id || p.status !== "pending") fail("You can only cancel your own pending payments.");
    await db.delete(payments).where(and(eq(payments.id, paymentId), eq(payments.status, "pending")));
    refresh();
  });
}

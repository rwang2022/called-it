import "server-only";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import { betOptions, bets, positions, reviews, settlements, type Outcome } from "../db/schema";
import { computePayouts } from "../engine/payout";
import {
  CLAUDE_ID,
  REVIEW_WINDOW_MS,
  VOTE_WINDOW_MS,
  decideDisputed,
  decideProposed,
} from "../engine/rules";
import { logActivity } from "../data/activity";
import { withNotifications } from "../notify";
import { noticeCallMade, noticeDisputeOpened, noticeSettled, sweepTimedNotices } from "../notify/events";

type Via = "confirmed" | "window" | "vote";

/** Final, idempotent settlement. Returns false if someone else already settled it. */
export async function settleBet(betId: string, outcome: Outcome, via: Via): Promise<boolean> {
  const settled = await db.transaction(async (tx) => {
    const bet = await tx.select().from(bets).where(eq(bets.id, betId)).get();
    if (!bet || bet.status === "settled" || bet.status === "cancelled") return false;
    const ps = await tx.select().from(positions).where(eq(positions.betId, betId));
    const optionCount = (await tx.select({ id: betOptions.id }).from(betOptions).where(eq(betOptions.betId, betId))).length;
    const results = computePayouts(
      bet.kind,
      ps.map((p) => ({
        id: p.id,
        userId: p.userId,
        optionId: p.optionId,
        amountCents: bet.stakeMode === "money" && p.userId !== CLAUDE_ID ? p.amountCents : 0,
        createdAt: p.createdAt.getTime(),
      })),
      outcome,
      optionCount,
    );
    const now = new Date();
    const claimed = await tx
      .update(bets)
      .set({ status: "settled", outcome, settledAt: now, settledVia: via, updatedAt: now })
      .where(and(eq(bets.id, betId), inArray(bets.status, ["open", "proposed", "disputed"])))
      .returning({ id: bets.id });
    if (claimed.length === 0) return false;
    if (results.length > 0) {
      await tx.insert(settlements).values(
        results.map((r) => ({
          betId,
          userId: r.userId,
          groupId: bet.groupId,
          netCents: r.netCents,
          stakedCents: r.stakedCents,
          result: r.result,
          createdAt: now,
        })),
      );
    }
    await logActivity({ groupId: bet.groupId, betId, type: "settled", data: { via, outcome: outcome.type } }, tx);
    return true;
  });
  if (settled) noticeSettled(betId);
  return settled;
}

/** Re-evaluate a bet under review and settle it if the rules say so. */
export async function advanceBet(betId: string, now = Date.now()) {
  const bet = await db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!bet || !bet.proposal) return;
  if (bet.status !== "proposed" && bet.status !== "disputed") return;
  const [ps, rs] = await Promise.all([
    db.select({ userId: positions.userId }).from(positions).where(eq(positions.betId, betId)),
    db.select().from(reviews).where(eq(reviews.betId, betId)),
  ]);
  if (bet.status === "proposed") {
    const d = decideProposed(bet, ps, rs, now);
    if (d === "settle") {
      const allConfirmed = !bet.reviewDeadline || now < bet.reviewDeadline.getTime();
      await settleBet(betId, bet.proposal, allConfirmed ? "confirmed" : "window");
    }
  } else {
    const d = decideDisputed(bet, ps, rs, now);
    if (d === "settle") await settleBet(betId, bet.proposal, "vote");
    if (d === "void") await settleBet(betId, { type: "void" }, "vote");
  }
}

/** A judge (or Claude) makes a call. Starts or restarts the review window. */
export async function proposeOutcome(betId: string, proposerId: string, outcome: Outcome, note: string | null) {
  const now = new Date();
  const updated = await db
    .update(bets)
    .set({
      status: "proposed",
      proposal: outcome,
      proposalNote: note,
      proposalVersion: sql`${bets.proposalVersion} + 1`,
      proposedById: proposerId,
      proposedAt: now,
      reviewDeadline: new Date(now.getTime() + REVIEW_WINDOW_MS),
      disputedAt: null,
      voteDeadline: null,
      updatedAt: now,
    })
    .where(and(eq(bets.id, betId), inArray(bets.status, ["open", "proposed", "disputed"])))
    .returning({ groupId: bets.groupId });
  if (updated.length === 0) return false;
  await logActivity({ groupId: updated[0].groupId, betId, actorId: proposerId, type: "proposed", data: { outcome: outcome.type } });
  noticeCallMade(betId);
  await advanceBet(betId);
  return true;
}

/** Move a proposed call into a dispute vote (first dispute only). */
export async function openDispute(betId: string, userId: string) {
  const now = new Date();
  const updated = await db
    .update(bets)
    .set({ status: "disputed", disputedAt: now, voteDeadline: new Date(now.getTime() + VOTE_WINDOW_MS), updatedAt: now })
    .where(and(eq(bets.id, betId), eq(bets.status, "proposed")))
    .returning({ groupId: bets.groupId });
  if (updated.length > 0) {
    await logActivity({ groupId: updated[0].groupId, betId, actorId: userId, type: "disputed" });
    noticeDisputeOpened(betId, userId);
  }
}

/**
 * Settle anything whose review or vote window has lapsed, and send clock-driven
 * notices (a bet came due, Claude's pick is out). Cheap; safe to call often.
 */
export async function sweepDue(groupIds?: string[]) {
  return withNotifications(null, () => sweepDueInner(groupIds));
}

async function sweepDueInner(groupIds?: string[]) {
  const now = new Date();
  const due = await db
    .select({ id: bets.id })
    .from(bets)
    .where(
      and(
        groupIds && groupIds.length ? inArray(bets.groupId, groupIds) : undefined,
        or(
          and(eq(bets.status, "proposed"), lte(bets.reviewDeadline, now)),
          and(eq(bets.status, "disputed"), lte(bets.voteDeadline, now)),
        ),
      ),
    )
    .limit(50);
  for (const b of due) {
    try {
      await advanceBet(b.id, now.getTime());
    } catch (e) {
      console.error("sweep failed for bet", b.id, e);
    }
  }
  sweepTimedNotices(groupIds);
}

/** Bets that need Claude to do something right now. */
export async function claudeWorkDue(groupIds?: string[]) {
  const now = Date.now();
  const staleRunning = new Date(now - 10 * 60 * 1000);
  const predictRetry = new Date(now - 5 * 60 * 1000);
  const resolveRetry = new Date(now - 6 * 60 * 60 * 1000);
  const scope = groupIds && groupIds.length ? inArray(bets.groupId, groupIds) : undefined;
  const predict = await db
    .select({ id: bets.id })
    .from(bets)
    .where(
      and(
        scope,
        eq(bets.status, "open"),
        eq(bets.isPublic, true),
        sql`${bets.closesAt} > ${now}`,
        or(
          and(eq(bets.claudePredict, "pending"), or(isNull(bets.claudeLastAttemptAt), lte(bets.claudeLastAttemptAt, predictRetry))),
          and(eq(bets.claudePredict, "running"), lte(bets.claudeLastAttemptAt, staleRunning)),
        ),
      ),
    )
    .limit(5);
  const resolve = await db
    .select({ id: bets.id })
    .from(bets)
    .where(
      and(
        scope,
        eq(bets.status, "open"),
        eq(bets.judgeMode, "claude"),
        sql`${bets.resolvesAt} <= ${now}`,
        or(
          eq(bets.claudeResolve, "none"),
          and(eq(bets.claudeResolve, "pending"), or(isNull(bets.claudeLastAttemptAt), lte(bets.claudeLastAttemptAt, resolveRetry))),
          and(eq(bets.claudeResolve, "running"), lte(bets.claudeLastAttemptAt, staleRunning)),
        ),
      ),
    )
    .limit(5);
  return { predict: predict.map((r) => r.id), resolve: resolve.map((r) => r.id) };
}

export async function optionsFor(betId: string) {
  return db.select().from(betOptions).where(eq(betOptions.betId, betId)).orderBy(betOptions.sortOrder);
}

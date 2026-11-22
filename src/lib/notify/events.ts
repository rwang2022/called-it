import "server-only";
import { and, eq, exists, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  betOptions,
  bets,
  groups,
  notificationMarks,
  payments,
  positions,
  pushSubscriptions,
  reviews,
  settlements,
  type Bet,
} from "../db/schema";
import { CLAUDE_FALLBACK_MS, CLAUDE_ID, DAY, judgeOf, reviewersOf } from "../engine/rules";
import { usersById } from "../data/common";
import { copy, type Notice } from "./compose";
import { queueNotices } from "./index";

/**
 * The domain events that notify people. Each queues a producer on the current
 * batch (see `withNotifications`); producers re-read state when they run, so a
 * notice about something already overtaken (a vote that settled instantly, a
 * payment cancelled) is simply dropped.
 */

const loadBet = (betId: string) => db.select().from(bets).where(eq(bets.id, betId)).get();
const humans = (ids: string[]) => [...new Set(ids)].filter((id) => id !== CLAUDE_ID);
const unknown = { name: "Someone", isBot: false };

async function outcomeLabel(bet: Bet): Promise<string | null> {
  const o = bet.outcome ?? bet.proposal;
  if (!o) return null;
  if (o.type === "void") return "void";
  if (o.type !== "option") return null;
  const opt = await db.select({ label: betOptions.label }).from(betOptions).where(eq(betOptions.id, o.optionId)).get();
  return opt?.label ?? null;
}

const notices = (bet: Bet, userIds: string[], kind: Notice["kind"], payload: Notice["payload"]): Notice[] =>
  userIds.map((userId) => ({ userId, groupId: bet.groupId, kind, subject: bet.id, payload }));

/** A judge (or Claude) made a call: everyone who gets a say should confirm or dispute. */
export function noticeCallMade(betId: string) {
  queueNotices(async () => {
    const bet = await loadBet(betId);
    if (!bet || bet.status !== "proposed") return [];
    const ps = await db.select({ userId: positions.userId }).from(positions).where(eq(positions.betId, betId));
    const reviewers = reviewersOf(bet, ps);
    if (reviewers.length === 0) return [];
    const [label, people] = await Promise.all([outcomeLabel(bet), usersById([bet.proposedById ?? ""])]);
    const caller = people.get(bet.proposedById ?? "") ?? unknown;
    return notices(bet, reviewers, "review", copy.callMade(bet, caller, label));
  });
}

/** A call was disputed: the participants who haven't weighed in yet now vote. */
export function noticeDisputeOpened(betId: string, disputerId: string) {
  queueNotices(async () => {
    const bet = await loadBet(betId);
    if (!bet || bet.status !== "disputed") return [];
    const [ps, rs, people] = await Promise.all([
      db.select({ userId: positions.userId }).from(positions).where(eq(positions.betId, betId)),
      db
        .select({ userId: reviews.userId })
        .from(reviews)
        .where(and(eq(reviews.betId, betId), eq(reviews.proposalVersion, bet.proposalVersion))),
      usersById([disputerId]),
    ]);
    const done = new Set([...rs.map((r) => r.userId), disputerId]);
    const voters = reviewersOf(bet, ps).filter((u) => !done.has(u));
    return notices(bet, voters, "vote", copy.disputeOpened(bet, people.get(disputerId) ?? unknown));
  });
}

/** A bet settled: tell each human participant how it went for them. */
export function noticeSettled(betId: string) {
  queueNotices(async () => {
    const bet = await loadBet(betId);
    if (!bet || bet.status !== "settled") return [];
    const [rows, label] = await Promise.all([
      db.select().from(settlements).where(eq(settlements.betId, betId)),
      outcomeLabel(bet),
    ]);
    const ref = { ...bet, money: bet.stakeMode === "money" };
    return rows
      .filter((r) => r.userId !== CLAUDE_ID)
      .flatMap((r) => notices(bet, [r.userId], "settled", copy.settled(ref, r, label)));
  });
}

/** Someone was challenged head-to-head. */
export function noticeChallenge(betId: string) {
  queueNotices(async () => {
    const bet = await loadBet(betId);
    if (!bet || bet.kind !== "challenge" || bet.status !== "open" || !bet.challengeOpponentId) return [];
    const people = await usersById([bet.creatorId]);
    const payload = copy.challenged(bet, people.get(bet.creatorId) ?? unknown, bet.challengeOpponentTask);
    return notices(bet, [bet.challengeOpponentId], "challenge", payload);
  });
}

/** "I paid you": the receiver needs to confirm it. */
export function noticePaymentClaimed(paymentId: string) {
  queueNotices(async () => {
    const p = await db.select().from(payments).where(eq(payments.id, paymentId)).get();
    if (!p || p.status !== "pending") return [];
    const [people, group] = await Promise.all([
      usersById([p.fromId]),
      db.select({ name: groups.name }).from(groups).where(eq(groups.id, p.groupId)).get(),
    ]);
    const payload = copy.paymentClaimed(p, people.get(p.fromId) ?? unknown, group?.name ?? "the group");
    return [{ userId: p.toId, groupId: p.groupId, kind: "payment", subject: p.id, payload }];
  });
}

/** How long a clock-driven notice stays worth sending (e.g. to someone who turns notifications on later). */
const RECENT_DUE = 3 * DAY;
const RECENT_REVEAL = DAY;

/**
 * Notices driven by the clock instead of an action: a bet you judge came due,
 * Claude gave up so the creator can call it, Claude's pick was revealed when
 * betting closed. Each fires once per person, claimed in `notification_marks`
 * only for people who have a device to reach, so turning notifications on
 * while one is still recent (and unhandled) still brings it.
 */
export function sweepTimedNotices(groupIds?: string[]) {
  queueNotices(async () => {
    const now = Date.now();
    const at = (ms: number) => new Date(ms);
    const scope = groupIds && groupIds.length ? inArray(bets.groupId, groupIds) : undefined;
    const hasPosition = exists(db.select({ x: sql`1` }).from(positions).where(eq(positions.betId, bets.id)));

    const [due, fallback, revealed] = await Promise.all([
      db
        .select()
        .from(bets)
        .where(
          and(
            scope,
            eq(bets.status, "open"),
            ne(bets.judgeMode, "claude"),
            lte(bets.resolvesAt, at(now)),
            gte(bets.resolvesAt, at(now - RECENT_DUE)),
            hasPosition,
          ),
        )
        .limit(50),
      db
        .select()
        .from(bets)
        .where(
          and(
            scope,
            eq(bets.status, "open"),
            eq(bets.judgeMode, "claude"),
            or(
              and(eq(bets.claudeResolve, "failed"), gte(bets.resolvesAt, at(now - 30 * DAY))),
              and(lte(bets.resolvesAt, at(now - CLAUDE_FALLBACK_MS)), gte(bets.resolvesAt, at(now - CLAUDE_FALLBACK_MS - RECENT_DUE))),
            ),
            hasPosition,
          ),
        )
        .limit(50),
      db
        .select()
        .from(bets)
        .where(
          and(
            scope,
            eq(bets.status, "open"),
            eq(bets.isPublic, true),
            lte(bets.closesAt, at(now)),
            gte(bets.closesAt, at(now - RECENT_REVEAL)),
            exists(
              db
                .select({ x: sql`1` })
                .from(positions)
                .where(and(eq(positions.betId, bets.id), eq(positions.userId, CLAUDE_ID))),
            ),
          ),
        )
        .limit(50),
    ]);
    if (due.length + fallback.length + revealed.length === 0) return [];

    const ps = revealed.length ? await db.select().from(positions).where(inArray(positions.betId, revealed.map((b) => b.id))) : [];
    const optIds = ps.flatMap((p) => (p.userId === CLAUDE_ID && p.optionId ? [p.optionId] : []));
    const labels = new Map(
      optIds.length ? (await db.select().from(betOptions).where(inArray(betOptions.id, optIds))).map((o) => [o.id, o.label]) : [],
    );

    const candidates: { key: string; notice: Notice }[] = [];
    const add = (prefix: string, bet: Bet, userIds: string[], kind: Notice["kind"], payload: Notice["payload"]) => {
      for (const n of notices(bet, humans(userIds), kind, payload)) candidates.push({ key: `${prefix}:${bet.id}:${n.userId}`, notice: n });
    };
    for (const b of due) add("judge", b, [judgeOf(b)], "judge", copy.judgeDue(b));
    for (const b of fallback) add("fallback", b, [b.creatorId], "judge", copy.claudeFallback(b));
    for (const b of revealed) {
      const here = ps.filter((p) => p.betId === b.id);
      const claude = here.find((p) => p.userId === CLAUDE_ID);
      const pick = claude?.optionId ? labels.get(claude.optionId) : undefined;
      if (claude && pick) add("reveal", b, here.map((p) => p.userId), "reveal", copy.claudeRevealed(b, pick, claude.confidence));
    }

    // Only people with a device, and only what hasn't been sent to them yet.
    const userIds = [...new Set(candidates.map((c) => c.notice.userId))];
    const reachable = new Set(
      userIds.length
        ? (await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds))).map(
            (r) => r.userId,
          )
        : [],
    );
    const open = candidates.filter((c) => reachable.has(c.notice.userId));
    if (open.length === 0) return [];
    const sent = new Set(
      (await db.select({ key: notificationMarks.key }).from(notificationMarks).where(inArray(notificationMarks.key, open.map((c) => c.key)))).map(
        (r) => r.key,
      ),
    );
    const fresh = open.filter((c) => !sent.has(c.key));
    if (fresh.length === 0) return [];
    // Claim atomically so racing sweeps (two page loads, the cron) can't both send.
    const claimed = new Set(
      (
        await db
          .insert(notificationMarks)
          .values(fresh.map((c) => ({ key: c.key })))
          .onConflictDoNothing()
          .returning({ key: notificationMarks.key })
      ).map((r) => r.key),
    );
    return fresh.filter((c) => claimed.has(c.key)).map((c) => c.notice);
  });
}

import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { bets, groupMembers, groups, positions, reviews, settlements, type Bet } from "../db/schema";
import { categoryBreakdown, rankBy, statsFor, type ForecasterStats, type Graded } from "../engine/scoring";
import { onProbation, ratingOutlook, scoreBet, type RatingInput, type ScoredPick } from "../engine/rating";
import { judgeOf } from "../engine/rules";
import { CLAUDE_ID } from "../engine/rules";
import { usersById, type MiniUser } from "./common";

export type StatsFilter = { category?: string | null; sinceMs?: number | null };

type SettledBundle = {
  bets: Bet[];
  graded: Graded[];
  challenge: { userId: string; passed: boolean; category: string; settledAt: number }[];
};

/** Every graded call in the given groups. Void bets don't count for or against anyone. */
export async function settledBundle(groupIds: string[], filter: StatsFilter = {}): Promise<SettledBundle> {
  if (groupIds.length === 0) return { bets: [], graded: [], challenge: [] };
  const rows = (
    await db
      .select()
      .from(bets)
      .where(and(inArray(bets.groupId, groupIds), eq(bets.status, "settled")))
      .orderBy(asc(bets.settledAt))
  ).filter(
    (b) =>
      (!filter.category || b.category === filter.category) &&
      (!filter.sinceMs || (b.settledAt?.getTime() ?? 0) >= filter.sinceMs),
  );
  const ids = rows.map((b) => b.id);
  if (ids.length === 0) return { bets: rows, graded: [], challenge: [] };
  const [poss, setts, revs, joins] = await Promise.all([
    db.select().from(positions).where(inArray(positions.betId, ids)),
    db.select().from(settlements).where(inArray(settlements.betId, ids)),
    db.select().from(reviews).where(inArray(reviews.betId, ids)),
    membershipDates(groupIds),
  ]);
  const settleKey = new Map(setts.map((s) => [`${s.betId}:${s.userId}`, s]));
  const graded: Graded[] = [];
  const challenge: SettledBundle["challenge"] = [];

  for (const b of rows) {
    const o = b.outcome;
    if (!o || o.type === "void") continue;
    const bp = poss.filter((p) => p.betId === b.id);
    const humanPool = bp.filter((p) => p.userId !== CLAUDE_ID);
    const scored =
      o.type === "option" && b.kind !== "challenge"
        ? new Map(scoreBet(ratingInput(b, bp, revs.filter((r) => r.betId === b.id), joins), o.optionId).picks.map((p) => [p.userId, p]))
        : new Map<string, ScoredPick>();
    const total = humanPool.reduce((a, p) => a + p.amountCents, 0);
    for (const p of bp) {
      const s = settleKey.get(`${b.id}:${p.userId}`);
      const settledAt = b.settledAt?.getTime() ?? b.updatedAt.getTime();
      if (b.kind === "challenge") {
        if (o.type !== "challenge") continue;
        challenge.push({ userId: p.userId, passed: o.results[p.id] === "pass", category: b.category, settledAt });
        continue;
      }
      if (o.type !== "option") continue;
      const sideCount = humanPool.filter((x) => x.optionId === p.optionId).length;
      const sidePool = humanPool.filter((x) => x.optionId === p.optionId).reduce((a, x) => a + x.amountCents, 0);
      graded.push({
        userId: p.userId,
        betId: b.id,
        category: b.category,
        kind: b.kind,
        isPublic: b.isPublic,
        confidence: p.confidence,
        hit: p.optionId === o.optionId,
        netCents: s?.netCents ?? 0,
        stakedCents: s?.stakedCents ?? p.amountCents,
        money: b.stakeMode === "money",
        settledAt,
        sideShare: total > 0 ? sidePool / total : sideCount / Math.max(1, humanPool.length),
        rated: scored.get(p.userId)?.rated ?? false,
        edge: scored.get(p.userId)?.edge ?? null,
        edgeFrom: scored.get(p.userId)?.edgeFrom,
      });
    }
  }
  return { bets: rows, graded, challenge };
}

type ReviewRow = { userId: string; kind: "confirm" | "dispute"; proposalVersion: number };
type PositionRow = { userId: string; optionId: string | null; confidence: number; createdAt: Date };
/** groupId → { group's createdAt, userId → joinedAt } for the new-member rule. */
type Joins = Map<string, { createdAt: number; joined: Map<string, number> }>;

export async function membershipDates(groupIds: string[]): Promise<Joins> {
  if (groupIds.length === 0) return new Map();
  const [gs, ms] = await Promise.all([
    db.select({ id: groups.id, createdAt: groups.createdAt }).from(groups).where(inArray(groups.id, groupIds)),
    db.select().from(groupMembers).where(inArray(groupMembers.groupId, groupIds)),
  ]);
  const out: Joins = new Map(gs.map((g) => [g.id, { createdAt: g.createdAt.getTime(), joined: new Map() }]));
  for (const m of ms) out.get(m.groupId)?.joined.set(m.userId, m.joinedAt.getTime());
  return out;
}

/** A settled bet's rows in the shape the rating engine takes (see engine/rating.ts). */
export function ratingInput(
  b: Pick<Bet, "groupId" | "createdAt" | "closesAt" | "proposedAt" | "proposedById" | "settledVia" | "proposalVersion">,
  bp: PositionRow[],
  rs: ReviewRow[],
  joins: Joins,
): RatingInput {
  const g = joins.get(b.groupId);
  return {
    createdAt: b.createdAt.getTime(),
    closesAt: b.closesAt.getTime(),
    proposedAt: b.proposedAt?.getTime() ?? null,
    proposedById: b.proposedById,
    settledVia: b.settledVia ?? null,
    forecasts: bp.map((p) => ({
      userId: p.userId,
      optionId: p.optionId,
      confidence: p.confidence,
      probation: p.userId !== CLAUDE_ID && Boolean(g) && onProbation(g!.joined.get(p.userId), g!.createdAt, p.createdAt.getTime()),
    })),
    confirmedBy: rs.filter((r) => r.kind === "confirm" && r.proposalVersion === b.proposalVersion).map((r) => r.userId),
  };
}

/** Rating and per-pick scores for one settled bet page; null unless it settled on an option. */
export async function betScores(betId: string) {
  const b = await db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!b || b.status !== "settled" || b.kind === "challenge" || b.outcome?.type !== "option") return null;
  const [bp, rs, joins] = await Promise.all([
    db.select().from(positions).where(eq(positions.betId, betId)),
    db.select({ userId: reviews.userId, kind: reviews.kind, proposalVersion: reviews.proposalVersion }).from(reviews).where(eq(reviews.betId, betId)),
    membershipDates([b.groupId]),
  ]);
  return scoreBet(ratingInput(b, bp, rs, joins), b.outcome.optionId);
}

/**
 * Will an open bet count toward scores? The live checklist, plus the people who
 * could take over judging without a conflict (in the group, no position, not the subject).
 */
export async function betOutlook(betId: string) {
  const b = await db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!b || b.status !== "open" || b.kind === "challenge") return null;
  const [bp, joins, members] = await Promise.all([
    db.select({ userId: positions.userId, createdAt: positions.createdAt }).from(positions).where(eq(positions.betId, betId)),
    membershipDates([b.groupId]),
    db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, b.groupId)),
  ]);
  const g = joins.get(b.groupId);
  const outlook = ratingOutlook({
    createdAt: b.createdAt.getTime(),
    closesAt: b.closesAt.getTime(),
    judgeId: judgeOf(b),
    forecasts: bp.map((p) => ({
      userId: p.userId,
      probation: p.userId !== CLAUDE_ID && Boolean(g) && onProbation(g!.joined.get(p.userId), g!.createdAt, p.createdAt.getTime()),
    })),
  });
  const betting = new Set(bp.map((p) => p.userId));
  const neutralIds = members.map((m) => m.userId).filter((id) => !betting.has(id) && id !== b.subjectId && id !== CLAUDE_ID);
  const people = await usersById(neutralIds);
  return { ...outlook, neutralPeople: neutralIds.map((id) => people.get(id)).filter((u): u is MiniUser => Boolean(u)) };
}

export type BetOutlook = NonNullable<Awaited<ReturnType<typeof betOutlook>>>;

export type LeaderRow = ForecasterStats & { user: MiniUser; followThrough: { n: number; passed: number } };

export type JudgeRow = {
  user: MiniUser;
  calls: number;
  disputed: number;
  overturned: number;
  medianDelayHours: number | null;
};

export async function leaderboard(groupIds: string[], memberIds: string[], filter: StatsFilter = {}) {
  const bundle = await settledBundle(groupIds, filter);
  const everyone = [...new Set([...memberIds, CLAUDE_ID])];
  const people = await usersById(everyone);
  const graded = bundle.graded;
  const claudePlayed = graded.some((g) => g.userId === CLAUDE_ID);
  const rows: LeaderRow[] = everyone
    .filter((id) => id !== CLAUDE_ID || claudePlayed)
    .filter((id) => people.has(id))
    .map((id) => {
      const ch = bundle.challenge.filter((c) => c.userId === id);
      return {
        ...statsFor(id, graded),
        user: people.get(id)!,
        followThrough: { n: ch.length, passed: ch.filter((c) => c.passed).length },
      };
    });

  // Judges: whoever made the final call on each settled bet.
  const judgeMap = new Map<string, { calls: number; disputed: number; overturned: number; delays: number[] }>();
  for (const b of bundle.bets) {
    if (!b.proposedById) continue;
    const j = judgeMap.get(b.proposedById) ?? { calls: 0, disputed: 0, overturned: 0, delays: [] };
    j.calls += 1;
    if (b.settledVia === "vote") {
      j.disputed += 1;
      if (b.outcome?.type === "void" && b.proposal?.type !== "void") j.overturned += 1;
    }
    if (b.proposedAt) j.delays.push(Math.max(0, b.proposedAt.getTime() - b.resolvesAt.getTime()) / 3_600_000);
    judgeMap.set(b.proposedById, j);
  }
  const judgePeople = await usersById([...judgeMap.keys()]);
  const judges: JudgeRow[] = [...judgeMap]
    .filter(([id]) => judgePeople.has(id))
    .map(([id, j]) => {
      const d = [...j.delays].sort((a, b) => a - b);
      return {
        user: judgePeople.get(id)!,
        calls: j.calls,
        disputed: j.disputed,
        overturned: j.overturned,
        medianDelayHours: d.length ? d[Math.floor(d.length / 2)] : null,
      };
    })
    .sort((a, b) => a.overturned / a.calls - b.overturned / b.calls || b.calls - a.calls);

  // Cumulative P&L over time, money bets only.
  const settledIds = bundle.bets.filter((b) => b.stakeMode === "money").map((b) => b.id);
  const setts = settledIds.length
    ? await db.select().from(settlements).where(inArray(settlements.betId, settledIds)).orderBy(asc(settlements.createdAt))
    : [];
  const series = new Map<string, { t: number; v: number }[]>();
  const running = new Map<string, number>();
  for (const s of setts) {
    if (s.userId === CLAUDE_ID || s.netCents === 0) continue;
    const v = (running.get(s.userId) ?? 0) + s.netCents;
    running.set(s.userId, v);
    series.set(s.userId, [...(series.get(s.userId) ?? []), { t: s.createdAt.getTime(), v }]);
  }

  return {
    rows,
    bySkill: rankBy("skill", rows),
    byProfit: rankBy("profit", rows.filter((r) => r.user.id !== CLAUDE_ID)),
    byWinRate: rankBy("winrate", rows),
    judges,
    pnl: [...series].map(([userId, points]) => ({ user: people.get(userId)!, points })).filter((s) => s.user),
    graded,
    settledCount: bundle.bets.length,
  };
}

/** Bot-vs-human: on public bets both played, how often did each beat Claude? */
export function versusClaude(graded: Graded[]) {
  const byBet = new Map<string, Graded[]>();
  for (const g of graded) if (g.isPublic) byBet.set(g.betId, [...(byBet.get(g.betId) ?? []), g]);
  const rec = new Map<string, { wins: number; losses: number; ties: number }>();
  for (const gs of byBet.values()) {
    const c = gs.find((g) => g.userId === CLAUDE_ID);
    if (!c) continue;
    for (const h of gs) {
      if (h.userId === CLAUDE_ID) continue;
      const r = rec.get(h.userId) ?? { wins: 0, losses: 0, ties: 0 };
      if (h.hit && !c.hit) r.wins++;
      else if (!h.hit && c.hit) r.losses++;
      else r.ties++;
      rec.set(h.userId, r);
    }
  }
  return rec;
}

export function headToHead(targetId: string, graded: Graded[]) {
  const byBet = new Map<string, Graded[]>();
  for (const g of graded) byBet.set(g.betId, [...(byBet.get(g.betId) ?? []), g]);
  const rec = new Map<string, { wins: number; losses: number }>();
  for (const gs of byBet.values()) {
    const me = gs.find((g) => g.userId === targetId);
    if (!me) continue;
    for (const o of gs) {
      if (o.userId === targetId || o.hit === me.hit) continue; // same side or both wrong: no head-to-head
      const r = rec.get(o.userId) ?? { wins: 0, losses: 0 };
      if (me.hit) r.wins++;
      else r.losses++;
      rec.set(o.userId, r);
    }
  }
  return rec;
}

export async function profileStats(targetId: string, groupIds: string[]) {
  const bundle = await settledBundle(groupIds);
  const stats = statsFor(targetId, bundle.graded);
  const categories = categoryBreakdown(targetId, bundle.graded);
  const h2h = headToHead(targetId, bundle.graded);
  const people = await usersById([...h2h.keys()]);
  const challenges = bundle.challenge.filter((c) => c.userId === targetId);
  const vsClaude = versusClaude(bundle.graded).get(targetId) ?? null;
  const money = bundle.graded.filter((g) => g.userId === targetId && g.money).sort((a, b) => a.settledAt - b.settledAt);
  let run = 0;
  const pnl = money.map((g) => ({ t: g.settledAt, v: (run += g.netCents) }));
  return {
    stats,
    categories,
    pnl,
    headToHead: [...h2h]
      .map(([id, r]) => ({ user: people.get(id), ...r }))
      .filter((r): r is { user: MiniUser; wins: number; losses: number } => Boolean(r.user))
      .sort((a, b) => b.wins + b.losses - (a.wins + a.losses)),
    followThrough: { n: challenges.length, passed: challenges.filter((c) => c.passed).length },
    vsClaude,
  };
}

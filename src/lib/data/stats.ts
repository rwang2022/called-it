import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { bets, positions, reviews, settlements, type Bet } from "../db/schema";
import { brier, categoryBreakdown, rankBy, statsFor, type ForecasterStats, type Graded } from "../engine/scoring";
import { edgesFor, rateBet, type Rating } from "../engine/rating";
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
  const [poss, setts, revs] = await Promise.all([
    db.select().from(positions).where(inArray(positions.betId, ids)),
    db.select().from(settlements).where(inArray(settlements.betId, ids)),
    db.select().from(reviews).where(inArray(reviews.betId, ids)),
  ]);
  const settleKey = new Map(setts.map((s) => [`${s.betId}:${s.userId}`, s]));
  const graded: Graded[] = [];
  const challenge: SettledBundle["challenge"] = [];

  for (const b of rows) {
    const o = b.outcome;
    if (!o || o.type === "void") continue;
    const bp = poss.filter((p) => p.betId === b.id);
    const humanPool = bp.filter((p) => p.userId !== CLAUDE_ID);
    const rating = b.kind === "challenge" ? null : ratingOf(b, bp, revs.filter((r) => r.betId === b.id));
    const edges =
      rating?.rated && o.type === "option"
        ? edgesFor(bp.map((p) => ({ userId: p.userId, brier: brier(p.confidence, p.optionId === o.optionId) })))
        : new Map<string, number>();
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
        rated: Boolean(rating?.rated),
        edge: edges.get(p.userId) ?? null,
      });
    }
  }
  return { bets: rows, graded, challenge };
}

type ReviewRow = { userId: string; kind: "confirm" | "dispute"; proposalVersion: number };

/** Whether a settled bet counts toward scores, from its own rows (see engine/rating.ts). */
export function ratingOf(
  b: Pick<Bet, "createdAt" | "closesAt" | "proposedAt" | "proposedById" | "settledVia" | "proposalVersion">,
  bp: { userId: string; optionId: string | null }[],
  rs: ReviewRow[],
): Rating {
  return rateBet({
    createdAt: b.createdAt.getTime(),
    closesAt: b.closesAt.getTime(),
    proposedAt: b.proposedAt?.getTime() ?? null,
    proposedById: b.proposedById,
    settledVia: b.settledVia ?? null,
    forecasts: bp.map((p) => ({ userId: p.userId, optionId: p.optionId })),
    confirmedBy: rs.filter((r) => r.kind === "confirm" && r.proposalVersion === b.proposalVersion).map((r) => r.userId),
  });
}

/** The rating for one bet page; null until the bet has settled on an outcome. */
export async function betRating(betId: string): Promise<Rating | null> {
  const b = await db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!b || b.status !== "settled" || b.kind === "challenge" || !b.outcome || b.outcome.type === "void") return null;
  const [bp, rs] = await Promise.all([
    db.select({ userId: positions.userId, optionId: positions.optionId }).from(positions).where(eq(positions.betId, betId)),
    db.select({ userId: reviews.userId, kind: reviews.kind, proposalVersion: reviews.proposalVersion }).from(reviews).where(eq(reviews.betId, betId)),
  ]);
  return ratingOf(b, bp, rs);
}

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

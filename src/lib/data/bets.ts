import "server-only";
import { and, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import { db } from "../db";
import {
  betOptions,
  bets,
  comments,
  groups,
  positions,
  reviews,
  settlements,
  type Bet,
  type Outcome,
  type Source,
} from "../db/schema";
import { crowdForecast, poolStats } from "../engine/payout";
import { CLAUDE_ID, canJudge, judgeOf, phaseOf, tally, type Phase } from "../engine/rules";
import { usersById, type MiniUser } from "./common";

export type PositionVM = {
  id: string;
  user: MiniUser;
  optionId: string | null;
  amountCents: number;
  confidence: number;
  task: string | null;
  note: string | null;
  sources: Source[] | null;
  createdAt: number;
};

export type OptionVM = {
  id: string;
  label: string;
  pool: number;
  share: number;
  count: number;
  multiplier: number | null;
  crowd: number | null;
  backers: MiniUser[];
};

export type ClaudeState =
  | { state: "none" }
  | { state: "thinking" }
  | { state: "failed" }
  | { state: "sealed" }
  | { state: "revealed"; position: PositionVM };

export type BetVM = {
  id: string;
  groupId: string;
  group: { id: string; name: string; hue: number };
  title: string;
  description: string | null;
  criteria: string | null;
  category: string;
  kind: Bet["kind"];
  stakeMode: Bet["stakeMode"];
  stakeCents: number;
  customStakes: boolean;
  isPublic: boolean;
  status: Bet["status"];
  phase: Phase;
  closesAt: number;
  resolvesAt: number;
  createdAt: number;
  settledAt: number | null;
  creator: MiniUser;
  subject: MiniUser | null;
  judgeMode: Bet["judgeMode"];
  judge: MiniUser | null;
  challengeOpponent: MiniUser | null;
  challengeOpponentTask: string | null;
  options: OptionVM[];
  /** Human positions, plus Claude's once revealed. */
  positions: PositionVM[];
  potCents: number;
  claude: ClaudeState;
  mine: PositionVM | null;
  outcome: Outcome | null;
  proposal: Outcome | null;
  proposalNote: string | null;
  proposalVersion: number;
  proposedBy: MiniUser | null;
  proposedAt: number | null;
  reviewDeadline: number | null;
  voteDeadline: number | null;
  settledVia: Bet["settledVia"];
  claudeNote: string | null;
  myNetCents: number | null;
  myResult: "win" | "loss" | "push" | null;
  /** Viewer-relative flags for UI */
  viewerIsJudge: boolean;
  viewerIsParticipant: boolean;
};

const isRevealed = (b: Bet, now: number) => b.status !== "open" || now >= b.closesAt.getTime();

/** Turn raw rows into view models. Claude's pick stays server-side until betting closes. */
export async function hydrateBets(rows: Bet[], viewerId: string, now = Date.now()): Promise<BetVM[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((b) => b.id);
  const [opts, poss, grps, setts] = await Promise.all([
    db.select().from(betOptions).where(inArray(betOptions.betId, ids)).orderBy(betOptions.sortOrder),
    db.select().from(positions).where(inArray(positions.betId, ids)).orderBy(positions.createdAt),
    db
      .select({ id: groups.id, name: groups.name, hue: groups.hue })
      .from(groups)
      .where(inArray(groups.id, [...new Set(rows.map((b) => b.groupId))])),
    db
      .select()
      .from(settlements)
      .where(and(inArray(settlements.betId, ids), eq(settlements.userId, viewerId))),
  ]);
  const userIds = [
    ...rows.flatMap((b) => [b.creatorId, b.subjectId, b.judgeId, b.challengeOpponentId, b.proposedById]),
    ...poss.map((p) => p.userId),
    CLAUDE_ID,
  ].filter((x): x is string => Boolean(x));
  const people = await usersById(userIds);
  const groupMap = new Map(grps.map((g) => [g.id, g]));
  const settleMap = new Map(setts.map((s) => [s.betId, s]));
  const unknown: MiniUser = { id: "?", name: "Someone", image: null, isBot: false };
  const u = (id: string | null) => (id ? (people.get(id) ?? unknown) : null);

  return rows.map((b) => {
    const revealed = isRevealed(b, now);
    const all = poss
      .filter((p) => p.betId === b.id)
      .map(
        (p): PositionVM => ({
          id: p.id,
          user: u(p.userId)!,
          optionId: p.optionId,
          amountCents: p.amountCents,
          confidence: p.confidence,
          task: p.task,
          note: p.note,
          sources: p.sources ?? null,
          createdAt: p.createdAt.getTime(),
        }),
      );
    const claudePos = all.find((p) => p.user.id === CLAUDE_ID) ?? null;
    const visible = all.filter((p) => p.user.id !== CLAUDE_ID || revealed);
    const humans = all.filter((p) => p.user.id !== CLAUDE_ID);
    const options = opts.filter((o) => o.betId === b.id);
    const stats = poolStats(options, humans);
    const crowd = crowdForecast(options, humans);
    const claude: ClaudeState = claudePos
      ? revealed
        ? { state: "revealed", position: claudePos }
        : { state: "sealed" }
      : b.claudePredict === "pending" || b.claudePredict === "running"
        ? { state: "thinking" }
        : b.claudePredict === "failed"
          ? { state: "failed" }
          : { state: "none" };
    const mine = humans.find((p) => p.user.id === viewerId) ?? null;
    const s = settleMap.get(b.id);
    const judgeId = judgeOf(b);
    return {
      id: b.id,
      groupId: b.groupId,
      group: groupMap.get(b.groupId) ?? { id: b.groupId, name: "Group", hue: 260 },
      title: b.title,
      description: b.description,
      criteria: b.criteria,
      category: b.category,
      kind: b.kind,
      stakeMode: b.stakeMode,
      stakeCents: b.stakeCents,
      customStakes: b.customStakes,
      isPublic: b.isPublic,
      status: b.status,
      phase: phaseOf(b, now),
      closesAt: b.closesAt.getTime(),
      resolvesAt: b.resolvesAt.getTime(),
      createdAt: b.createdAt.getTime(),
      settledAt: b.settledAt?.getTime() ?? null,
      creator: u(b.creatorId)!,
      subject: u(b.subjectId),
      judgeMode: b.judgeMode,
      judge: u(judgeId),
      challengeOpponent: u(b.challengeOpponentId),
      challengeOpponentTask: b.challengeOpponentTask,
      options: options.map((o, i) => ({
        id: o.id,
        label: o.label,
        pool: stats[i].pool,
        share: stats[i].share,
        count: stats[i].count,
        multiplier: stats[i].multiplier,
        crowd: crowd?.get(o.id) ?? null,
        backers: visible.filter((p) => p.optionId === o.id).map((p) => p.user),
      })),
      positions: visible,
      potCents: humans.reduce((a, p) => a + p.amountCents, 0),
      claude,
      mine,
      outcome: b.outcome ?? null,
      proposal: b.proposal ?? null,
      proposalNote: b.proposalNote,
      proposalVersion: b.proposalVersion,
      proposedBy: u(b.proposedById),
      proposedAt: b.proposedAt?.getTime() ?? null,
      reviewDeadline: b.reviewDeadline?.getTime() ?? null,
      voteDeadline: b.voteDeadline?.getTime() ?? null,
      settledVia: b.settledVia,
      claudeNote: revealed ? b.claudeNote : null,
      myNetCents: s?.netCents ?? null,
      myResult: s?.result ?? null,
      viewerIsJudge: canJudge(b, viewerId, now),
      viewerIsParticipant: Boolean(mine),
    };
  });
}

export async function betDetail(betId: string, viewerId: string) {
  const row = await db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!row) return null;
  const [vm] = await hydrateBets([row], viewerId);
  const [revs, comms] = await Promise.all([
    db.select().from(reviews).where(eq(reviews.betId, betId)).orderBy(reviews.createdAt),
    db.select().from(comments).where(eq(comments.betId, betId)).orderBy(comments.createdAt),
  ]);
  const people = await usersById([...revs.map((r) => r.userId), ...comms.map((c) => c.userId)]);
  const allPositions = await db.select({ userId: positions.userId }).from(positions).where(eq(positions.betId, betId));
  const t = tally(row, allPositions, revs);
  const bySettle = await db.select().from(settlements).where(eq(settlements.betId, betId));
  return {
    bet: vm,
    raw: row,
    tally: {
      reviewers: t.reviewers,
      confirms: t.confirms,
      disputes: t.disputes,
      waitingOn: t.waitingOn,
    },
    reviews: revs
      .filter((r) => r.proposalVersion === row.proposalVersion)
      .map((r) => ({ ...r, user: people.get(r.userId)!, createdAt: r.createdAt.getTime() })),
    comments: comms.map((c) => ({
      id: c.id,
      body: c.body,
      user: people.get(c.userId) ?? { id: c.userId, name: "Someone", image: null, isBot: false },
      createdAt: c.createdAt.getTime(),
    })),
    settlements: bySettle.map((s) => ({ userId: s.userId, netCents: s.netCents, stakedCents: s.stakedCents, result: s.result })),
  };
}

export async function groupBets(groupId: string, viewerId: string, limit = 200) {
  const rows = await db.select().from(bets).where(eq(bets.groupId, groupId)).orderBy(desc(bets.createdAt)).limit(limit);
  return hydrateBets(rows, viewerId);
}

/** Bets across all of a user's groups that are still live (not settled or cancelled). */
export async function liveBetsAcross(groupIds: string[], viewerId: string) {
  if (groupIds.length === 0) return [];
  const rows = await db
    .select()
    .from(bets)
    .where(and(inArray(bets.groupId, groupIds), notInArray(bets.status, ["settled", "cancelled"])))
    .orderBy(bets.closesAt)
    .limit(300);
  return hydrateBets(rows, viewerId);
}

export async function recentSettledAcross(groupIds: string[], viewerId: string, limit = 12) {
  if (groupIds.length === 0) return [];
  const rows = await db
    .select()
    .from(bets)
    .where(and(inArray(bets.groupId, groupIds), eq(bets.status, "settled")))
    .orderBy(desc(bets.settledAt))
    .limit(limit);
  return hydrateBets(rows, viewerId);
}

/** Bets in shared groups that `targetId` took part in, newest first. */
export async function betsInvolving(targetId: string, groupIds: string[], viewerId: string, limit = 60) {
  if (groupIds.length === 0) return [];
  const mine = db.select({ id: positions.betId }).from(positions).where(eq(positions.userId, targetId));
  const rows = await db
    .select()
    .from(bets)
    .where(and(inArray(bets.groupId, groupIds), inArray(bets.id, mine), ne(bets.status, "cancelled")))
    .orderBy(desc(bets.createdAt))
    .limit(limit);
  return hydrateBets(rows, viewerId);
}

export type AttentionItem = {
  kind: "judge" | "review" | "vote" | "challenge" | "claude_fallback";
  bet: BetVM;
};

/** Everything waiting on this user, across their groups. */
export async function attentionFor(userId: string, groupIds: string[], live?: BetVM[]): Promise<AttentionItem[]> {
  if (groupIds.length === 0) return [];
  const list = live ?? (await liveBetsAcross(groupIds, userId));
  const ids = list.map((b) => b.id);
  const revs = ids.length
    ? await db.select().from(reviews).where(and(inArray(reviews.betId, ids), eq(reviews.userId, userId)))
    : [];
  const items: AttentionItem[] = [];
  for (const b of list) {
    if (b.status === "open" && b.viewerIsJudge && b.phase === "awaiting" && b.positions.length > 0) {
      items.push({ kind: b.judgeMode === "claude" ? "claude_fallback" : "judge", bet: b });
    }
    if (b.status === "proposed" || b.status === "disputed") {
      const caller = b.proposedBy?.id;
      const participant = b.positions.some((p) => p.user.id === userId);
      const reviewed = revs.some((r) => r.betId === b.id && r.proposalVersion === b.proposalVersion);
      if (participant && caller !== userId && !reviewed) {
        items.push({ kind: b.status === "proposed" ? "review" : "vote", bet: b });
      }
    }
    if (
      b.kind === "challenge" &&
      b.phase === "open" &&
      b.challengeOpponent?.id === userId &&
      !b.mine
    ) {
      items.push({ kind: "challenge", bet: b });
    }
  }
  return items;
}

export async function groupOf(betId: string) {
  return db.select({ groupId: bets.groupId }).from(bets).where(eq(bets.id, betId)).get();
}


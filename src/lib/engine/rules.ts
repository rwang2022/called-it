import type { BetStatus, JudgeMode, ClaudeJob, Outcome } from "../db/schema";

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
/** After a judge calls it, participants have this long to confirm or dispute. */
export const REVIEW_WINDOW_MS = 24 * HOUR;
/** A disputed call goes to a vote for this long. */
export const VOTE_WINDOW_MS = 48 * HOUR;
/** If Claude can't call a bet this long after it's due, the creator may step in. */
export const CLAUDE_FALLBACK_MS = 72 * HOUR;

export const CLAUDE_ID = "claude";

export type RuleBet = {
  creatorId: string;
  judgeMode: JudgeMode;
  judgeId: string | null;
  subjectId: string | null;
  status: BetStatus;
  closesAt: Date;
  resolvesAt: Date;
  proposedById: string | null;
  proposalVersion: number;
  reviewDeadline: Date | null;
  voteDeadline: Date | null;
  claudeResolve: ClaudeJob;
  kind: "binary" | "multi" | "challenge";
  isPublic: boolean;
};
export type RulePosition = { userId: string };
export type RuleReview = { userId: string; proposalVersion: number; kind: "confirm" | "dispute" };

export type Phase = "open" | "locked" | "awaiting" | "proposed" | "disputed" | "settled" | "cancelled";

export function phaseOf(bet: RuleBet, now: number): Phase {
  if (bet.status !== "open") return bet.status;
  if (now < bet.closesAt.getTime()) return "open";
  if (now < bet.resolvesAt.getTime()) return "locked";
  return "awaiting";
}

export const claudeFallbackOpen = (bet: RuleBet, now: number) =>
  bet.claudeResolve === "failed" || now >= bet.resolvesAt.getTime() + CLAUDE_FALLBACK_MS;

/** The human (or Claude) whose job it is to call this bet. */
export function judgeOf(bet: RuleBet): string {
  if (bet.judgeMode === "creator") return bet.creatorId;
  if (bet.judgeMode === "person") return bet.judgeId ?? bet.creatorId;
  return CLAUDE_ID;
}

export function canJudge(bet: RuleBet, userId: string, now: number): boolean {
  if (bet.status === "settled" || bet.status === "cancelled") return false;
  if (bet.judgeMode === "claude") {
    if (userId === CLAUDE_ID) return true;
    return userId === bet.creatorId && claudeFallbackOpen(bet, now);
  }
  return userId === judgeOf(bet);
}

/** Who gets a say on a call: human participants, minus whoever made the call. */
export function reviewersOf(bet: RuleBet, positions: RulePosition[]): string[] {
  const caller = bet.proposedById ?? judgeOf(bet);
  return [...new Set(positions.map((p) => p.userId))].filter((u) => u !== CLAUDE_ID && u !== caller);
}

export function tally(bet: RuleBet, positions: RulePosition[], reviews: RuleReview[]) {
  const reviewers = reviewersOf(bet, positions);
  const current = reviews.filter((r) => r.proposalVersion === bet.proposalVersion && reviewers.includes(r.userId));
  const confirms = current.filter((r) => r.kind === "confirm").map((r) => r.userId);
  const disputes = current.filter((r) => r.kind === "dispute").map((r) => r.userId);
  const waitingOn = reviewers.filter((u) => !confirms.includes(u) && !disputes.includes(u));
  return { reviewers, confirms, disputes, waitingOn };
}

export type Decision = "settle" | "void" | "wait";

/** While a call is under review: settle once everyone confirms or the window lapses. */
export function decideProposed(bet: RuleBet, positions: RulePosition[], reviews: RuleReview[], now: number): Decision {
  const t = tally(bet, positions, reviews);
  if (t.disputes.length > 0) return "wait"; // caller should have moved it to disputed
  if (t.reviewers.length === 0 || t.waitingOn.length === 0) return "settle";
  if (bet.reviewDeadline && now >= bet.reviewDeadline.getTime()) return "settle";
  return "wait";
}

/**
 * During a dispute, "confirm" reviews are votes to uphold the call and "dispute"
 * reviews are votes to void it. A strict majority ends it early; otherwise when
 * the vote closes, uphold needs more votes than void (ties void — refunds are
 * the conservative outcome).
 */
export function decideDisputed(bet: RuleBet, positions: RulePosition[], reviews: RuleReview[], now: number): Decision {
  const t = tally(bet, positions, reviews);
  const n = t.reviewers.length;
  const up = t.confirms.length;
  const down = t.disputes.length;
  if (up * 2 > n) return "settle";
  if (down * 2 > n) return "void";
  if (t.waitingOn.length === 0 || (bet.voteDeadline && now >= bet.voteDeadline.getTime())) {
    return up > down ? "settle" : "void";
  }
  return "wait";
}

export type Check = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Check => ({ ok: false, reason });
const yes: Check = { ok: true };

export function canTakePosition(bet: RuleBet, userId: string, now: number): Check {
  if (userId === CLAUDE_ID) return no("Claude places its own picks.");
  if (bet.status !== "open") return no("This bet is no longer taking positions.");
  if (now >= bet.closesAt.getTime()) return no("Betting has closed.");
  if (bet.judgeMode === "person" && bet.judgeId === userId) return no("Judges can't bet on what they judge.");
  return yes;
}

/**
 * Subjects of a yes/no bet ("Will Sam do a pull-up?") may only back themselves.
 * Betting on your own failure is an incentive to fail.
 */
export function subjectMayPick(bet: RuleBet, userId: string, optionIndex: number): Check {
  if (bet.kind === "binary" && bet.subjectId === userId && optionIndex !== 0) {
    return no("You can't bet against yourself — that's an incentive to fail.");
  }
  return yes;
}

export function canPropose(bet: RuleBet, userId: string, now: number, positionCount: number): Check {
  if (!canJudge(bet, userId, now)) return no("Only the judge can call this bet.");
  if (positionCount === 0) return no("Nobody has a position yet — cancel it instead.");
  if (bet.status === "open" || bet.status === "proposed" || bet.status === "disputed") return yes;
  return no("This bet is already final.");
}

export function canCancel(bet: RuleBet, positions: RulePosition[], userId: string): Check {
  if (userId !== bet.creatorId) return no("Only the creator can cancel.");
  if (bet.status !== "open") return no("Only open bets can be cancelled.");
  const others = positions.filter((p) => p.userId !== bet.creatorId && p.userId !== CLAUDE_ID);
  if (others.length > 0) return no("Others have joined — the judge can call it void instead.");
  return yes;
}

export function canReview(bet: RuleBet, positions: RulePosition[], reviews: RuleReview[], userId: string): Check {
  if (bet.status !== "proposed" && bet.status !== "disputed") return no("Nothing to review.");
  const t = tally(bet, positions, reviews);
  if (!t.reviewers.includes(userId)) return no("Only participants can weigh in.");
  if (!t.waitingOn.includes(userId)) return no("You've already weighed in on this call.");
  return yes;
}

export function validateOutcome(
  kind: RuleBet["kind"],
  outcome: Outcome,
  optionIds: string[],
  positionIds: string[],
): Check {
  if (outcome.type === "void") return yes;
  if (kind === "challenge") {
    if (outcome.type !== "challenge") return no("Mark each participant pass or fail.");
    for (const id of positionIds) {
      const r = outcome.results[id];
      if (r !== "pass" && r !== "fail") return no("Mark every participant pass or fail.");
    }
    if (Object.keys(outcome.results).some((k) => !positionIds.includes(k))) return no("Unknown participant.");
    return yes;
  }
  if (outcome.type !== "option" || !optionIds.includes(outcome.optionId)) return no("Pick the winning option.");
  return yes;
}

import { brier } from "./scoring";
import { CLAUDE_ID, DAY, HOUR } from "./rules";

/**
 * Which settled picks count toward forecasting scores ("rated"), and how much
 * each beat the room ("edge"). Pure functions; no database.
 *
 * Money always settles either way. Rating only decides whether a pick moves
 * anyone's record, like rated vs. unrated games in chess.
 */

/** Betting must have been open at least this long for a bet to be rated. */
export const MIN_OPEN_MS = HOUR;
/** Slack for time spent filling in the form, so the wizard's "1 hour" preset still counts. */
const FORM_GRACE_MS = 15 * 60_000;
/** Someone who joins an established group sits out of scoring this long. */
export const NEW_MEMBER_MS = 7 * DAY;
/** The founding week of a group: everyone who joins then is a founder, not "new". */
const FOUNDING_MS = 7 * DAY;

/**
 * A pick made in someone's first week in an established group doesn't count, for
 * or against anyone. Stops a throwaway account from feeding its owner free edge.
 * The group's founders are exempt, so a brand-new group isn't frozen for a week.
 */
export function onProbation(joinedAt: number | null | undefined, groupCreatedAt: number, pickedAt: number) {
  if (joinedAt == null) return false;
  return joinedAt > groupCreatedAt + FOUNDING_MS && pickedAt < joinedAt + NEW_MEMBER_MS;
}

export type Forecast = {
  userId: string;
  optionId: string | null;
  /** 1–99, confidence in the pick. */
  confidence: number;
  /** A new member's pick: ignored for scoring entirely. */
  probation?: boolean;
};

export type RatingInput = {
  createdAt: number;
  closesAt: number;
  /** When the (final) call was made; an early call stops betting at that moment. */
  proposedAt: number | null;
  proposedById: string | null;
  settledVia: "confirmed" | "window" | "vote" | "cancelled" | null;
  /** Every forecast on the bet, Claude's included. */
  forecasts: Forecast[];
  /** Users who explicitly confirmed the final call. */
  confirmedBy: string[];
};

export type Rating =
  | { status: "rated" }
  | { status: "partial"; reason: string; unrated: string[] }
  | { status: "unrated"; reason: string };

const REASONS = {
  solo: "Nobody else made a forecast, so there was no one to beat.",
  soloNew: "The only other forecasts came from new members, whose picks don't count in their first week.",
  short: "Betting was open for less than an hour.",
  judge: "The judge had a stake and nobody on another side confirmed the call, so the judge's side doesn't count. Everyone else had 24 hours to dispute it.",
  newMembers: "New members' picks don't count in their first week.",
};

/**
 * Rate a settled bet, pick by pick.
 *
 * Whole bet unrated: fewer than two counted forecasters, or betting open under an hour.
 * Judge's side unrated: the judge had a stake, called it their own way, nobody on
 * another side confirmed, and there was no dispute vote. (A judge who rules
 * against their own pick has no conflict, so that call counts in full.) Everyone else's picks still count: they had 24
 * hours and a push to dispute, so staying quiet can't erase a loss, and a judge
 * still can't award their own side a win nobody agreed to.
 */
export function rateBet(b: RatingInput, winningOptionId?: string): Rating {
  const counted = b.forecasts.filter((f) => !f.probation);
  const newbies = b.forecasts.filter((f) => f.probation).map((f) => f.userId);
  if (new Set(counted.map((f) => f.userId)).size < 2) return { status: "unrated", reason: newbies.length ? REASONS.soloNew : REASONS.solo };

  const stoppedAt = Math.min(b.closesAt, b.proposedAt ?? Infinity);
  if (stoppedAt - b.createdAt < MIN_OPEN_MS - FORM_GRACE_MS) return { status: "unrated", reason: REASONS.short };

  const judge = b.proposedById;
  const judgePick = judge && judge !== CLAUDE_ID ? counted.find((f) => f.userId === judge) : undefined;
  let judgeSide: string[] = [];
  const selfServing = judgePick && (winningOptionId === undefined || judgePick.optionId === winningOptionId);
  if (judgePick && selfServing && b.settledVia !== "vote") {
    const opponentConfirmed = counted.some(
      (f) => f.userId !== CLAUDE_ID && f.optionId !== judgePick.optionId && b.confirmedBy.includes(f.userId),
    );
    if (!opponentConfirmed) judgeSide = counted.filter((f) => f.optionId === judgePick.optionId).map((f) => f.userId);
  }

  const unrated = [...new Set([...judgeSide, ...newbies])];
  if (unrated.length === 0) return { status: "rated" };
  if (counted.every((f) => unrated.includes(f.userId))) return { status: "unrated", reason: REASONS.judge };
  return { status: "partial", reason: judgeSide.length ? REASONS.judge : REASONS.newMembers, unrated };
}

export const pickRated = (r: Rating, userId: string) =>
  r.status === "rated" || (r.status === "partial" && !r.unrated.includes(userId));

export type ScoredPick = {
  userId: string;
  optionId: string | null;
  confidence: number;
  hit: boolean;
  brier: number;
  rated: boolean;
  /** Others' average Brier minus this pick's; null when unrated. */
  edge: number | null;
  /** How much each other forecaster contributed to this pick's edge (sums to `edge`). */
  edgeFrom: Record<string, number>;
};

/**
 * Score every pick on a settled bet. Edge is the average Brier score of everyone
 * else on the bet minus yours (higher is better): calling a sure thing earns ~0
 * because everyone else called it too, and points only move between the people
 * on a bet, so two friends can't farm each other. New members are left out of
 * the room entirely.
 */
export function scoreBet(b: RatingInput, winningOptionId: string): { rating: Rating; picks: ScoredPick[] } {
  const rating = rateBet(b, winningOptionId);
  const room = b.forecasts.filter((f) => !f.probation);
  const briers = new Map(room.map((f) => [f.userId, brier(f.confidence, f.optionId === winningOptionId)]));
  const picks = b.forecasts.map((f): ScoredPick => {
    const mine = brier(f.confidence, f.optionId === winningOptionId);
    const rated = !f.probation && pickRated(rating, f.userId);
    const others = room.filter((o) => o.userId !== f.userId);
    const edgeFrom: Record<string, number> = {};
    if (rated && others.length) for (const o of others) edgeFrom[o.userId] = (briers.get(o.userId)! - mine) / others.length;
    return {
      userId: f.userId,
      optionId: f.optionId,
      confidence: f.confidence,
      hit: f.optionId === winningOptionId,
      brier: mine,
      rated,
      edge: rated && others.length ? Object.values(edgeFrom).reduce((a, x) => a + x, 0) : null,
      edgeFrom,
    };
  });
  return { rating, picks };
}

/** Edge shown as points: +8 means 0.08 Brier better than the room on average. */
export const edgePoints = (edge: number | null) => {
  if (edge === null) return "—";
  const pts = Math.round(edge * 100);
  return pts > 0 ? `+${pts}` : pts < 0 ? `−${-pts}` : "0";
};

/**
 * Before a bet settles: will it count? The live checklist on an open bet,
 * mirroring rateBet's rules with what's known so far.
 */
export function ratingOutlook(b: {
  createdAt: number;
  closesAt: number;
  judgeId: string;
  forecasts: { userId: string; probation?: boolean }[];
}) {
  const counted = b.forecasts.filter((f) => !f.probation);
  const forecasters = new Set(counted.map((f) => f.userId)).size;
  const openMs = b.closesAt - b.createdAt;
  const openLongEnough = openMs >= MIN_OPEN_MS - FORM_GRACE_MS;
  const judgeHasStake = b.judgeId !== CLAUDE_ID && counted.some((f) => f.userId === b.judgeId);
  return {
    forecasters,
    enoughForecasters: forecasters >= 2,
    openMs,
    openLongEnough,
    judgeHasStake,
    newMembers: b.forecasts.filter((f) => f.probation).length,
    willCount: forecasters >= 2 && openLongEnough && !judgeHasStake,
  };
}

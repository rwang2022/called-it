import { CLAUDE_ID, HOUR } from "./rules";

/**
 * Which settled bets count toward forecasting scores ("rated"), and how much
 * each pick beat the room ("edge"). Pure functions; no database.
 *
 * Money always settles either way. Rating only decides whether a bet moves
 * anyone's record, like rated vs. unrated games in chess.
 */

/** Betting must have been open at least this long for a bet to be rated. */
export const MIN_OPEN_MS = HOUR;
/** Slack for time spent filling in the form, so the wizard's "1 hour" preset still counts. */
const FORM_GRACE_MS = 15 * 60_000;

export type RatingInput = {
  createdAt: number;
  closesAt: number;
  /** When the (final) call was made; an early call stops betting at that moment. */
  proposedAt: number | null;
  proposedById: string | null;
  settledVia: "confirmed" | "window" | "vote" | "cancelled" | null;
  /** Every forecast on the bet, Claude's included. */
  forecasts: { userId: string; optionId: string | null }[];
  /** Users who explicitly confirmed the final call. */
  confirmedBy: string[];
};

export type Rating = { rated: true } | { rated: false; reason: string };

export function rateBet(b: RatingInput): Rating {
  const forecasters = new Set(b.forecasts.map((f) => f.userId));
  if (forecasters.size < 2) return { rated: false, reason: "Nobody else made a forecast, so there was no one to beat." };

  const stoppedAt = Math.min(b.closesAt, b.proposedAt ?? Infinity);
  if (stoppedAt - b.createdAt < MIN_OPEN_MS - FORM_GRACE_MS) return { rated: false, reason: "Betting was open for less than an hour." };

  // A judge who also had a position needs someone on another side to agree,
  // or the call has to survive a dispute vote. Silence isn't agreement.
  const judge = b.proposedById;
  const judgePick = judge && judge !== CLAUDE_ID ? b.forecasts.find((f) => f.userId === judge) : undefined;
  if (judgePick && b.settledVia !== "vote") {
    const opponentConfirmed = b.forecasts.some(
      (f) => f.userId !== judge && f.userId !== CLAUDE_ID && f.optionId !== judgePick.optionId && b.confirmedBy.includes(f.userId),
    );
    if (!opponentConfirmed) return { rated: false, reason: "The judge had a stake and nobody on another side confirmed the call." };
  }
  return { rated: true };
}

/**
 * Edge for each pick on one bet: the average Brier score of everyone else on the
 * bet minus yours (higher is better). Calling a sure thing earns ~0 because
 * everyone else called it too, and points can only move between the people on a
 * bet, never be created, so two friends can't farm each other.
 */
export function edgesFor(picks: { userId: string; brier: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  if (picks.length < 2) return out;
  const total = picks.reduce((a, p) => a + p.brier, 0);
  for (const p of picks) out.set(p.userId, (total - p.brier) / (picks.length - 1) - p.brier);
  return out;
}

/** Edge shown as points: +8 means 0.08 Brier better than the room on average. */
export const edgePoints = (edge: number | null) => {
  if (edge === null) return "—";
  const pts = Math.round(edge * 100);
  return pts > 0 ? `+${pts}` : pts < 0 ? `−${-pts}` : "0";
};

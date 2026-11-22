import type { BetKind, Outcome } from "../db/schema";

export type PayoutPosition = {
  id: string;
  userId: string;
  optionId: string | null;
  amountCents: number;
  /** Used only for deterministic tie-breaking of leftover cents. */
  createdAt: number;
};

export type PayoutResult = {
  positionId: string;
  userId: string;
  netCents: number;
  stakedCents: number;
  /** Correctness, independent of money: did this pick win? */
  result: "win" | "loss" | "push";
};

/**
 * Split `total` cents across `weights` proportionally using the largest-remainder
 * method, so the parts are integers that sum exactly to `total`. Ties go to the
 * earliest entry (callers pass weights in a stable order).
 */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w * total) / sum);
  const floors = exact.map(Math.floor);
  let leftover = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    if (weights[i] > 0) {
      floors[i] += 1;
      leftover -= 1;
    }
  }
  return floors;
}

const stable = (ps: PayoutPosition[]) =>
  [...ps].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

/**
 * Pari-mutuel settlement for yes/no and multiple-choice bets, and the
 * "whoever fails pays whoever succeeds" rule for challenges.
 *
 * Invariants (tested): nets sum to zero; nobody loses more than they staked;
 * zero-stake positions (Claude, bragging-rights bets) never move money.
 */
export function computePayouts(
  kind: BetKind,
  positions: PayoutPosition[],
  outcome: Outcome,
): PayoutResult[] {
  const ps = stable(positions);
  const base = (p: PayoutPosition, result: PayoutResult["result"], net = 0): PayoutResult => ({
    positionId: p.id,
    userId: p.userId,
    netCents: net,
    stakedCents: p.amountCents,
    result,
  });

  if (outcome.type === "void") return ps.map((p) => base(p, "push"));

  if (kind === "challenge") {
    if (outcome.type !== "challenge") throw new Error("Challenge bets need per-participant results");
    const passers = ps.filter((p) => outcome.results[p.id] === "pass");
    const failers = ps.filter((p) => outcome.results[p.id] === "fail");
    if (passers.length + failers.length !== ps.length) {
      throw new Error("Every challenge participant needs a pass/fail result");
    }
    // Everyone made it, or nobody did: nobody owes anybody.
    if (passers.length === 0 || failers.length === 0) return ps.map((p) => base(p, "push"));
    const pot = failers.reduce((a, p) => a + p.amountCents, 0);
    const shares = distribute(pot, passers.map((p) => p.amountCents || 1));
    const winnings = new Map(passers.map((p, i) => [p.id, shares[i]]));
    return ps.map((p) =>
      outcome.results[p.id] === "pass"
        ? base(p, "win", winnings.get(p.id)!)
        : base(p, "loss", -p.amountCents),
    );
  }

  if (outcome.type !== "option") throw new Error("Prediction bets settle on a winning option");
  const winners = ps.filter((p) => p.optionId === outcome.optionId);
  const losers = ps.filter((p) => p.optionId !== outcome.optionId);
  const winPool = winners.reduce((a, p) => a + p.amountCents, 0);
  const losePool = losers.reduce((a, p) => a + p.amountCents, 0);

  // No counterparty on one side: stakes are refunded, but picks are still graded.
  if (winPool === 0 || losePool === 0) {
    return ps.map((p) => base(p, p.optionId === outcome.optionId ? "win" : "loss"));
  }

  const shares = distribute(losePool, winners.map((p) => p.amountCents));
  const winnings = new Map(winners.map((p, i) => [p.id, shares[i]]));
  return ps.map((p) =>
    p.optionId === outcome.optionId
      ? base(p, "win", winnings.get(p.id)!)
      : base(p, "loss", -p.amountCents),
  );
}

/** Pool size per option and what $1 on each option would return if it wins. */
export function poolStats(
  options: { id: string }[],
  positions: { optionId: string | null; amountCents: number }[],
) {
  const total = positions.reduce((a, p) => a + p.amountCents, 0);
  return options.map((o) => {
    const backers = positions.filter((p) => p.optionId === o.id);
    const pool = backers.reduce((a, p) => a + p.amountCents, 0);
    return {
      optionId: o.id,
      pool,
      count: backers.length,
      share: total > 0 ? pool / total : backers.length / Math.max(1, positions.length),
      /** Gross return per $1 staked (includes the stake). null when nobody is on it yet. */
      multiplier: pool > 0 ? total / pool : null,
    };
  });
}

/**
 * "Wisdom of the crowd": each forecaster puts `confidence` on their pick and
 * spreads the remainder evenly across the other options; we average across people.
 */
export function crowdForecast(
  options: { id: string }[],
  positions: { optionId: string | null; confidence: number }[],
): Map<string, number> | null {
  const graded = positions.filter((p) => p.optionId);
  if (graded.length === 0 || options.length < 2) return null;
  const totals = new Map(options.map((o) => [o.id, 0]));
  for (const p of graded) {
    const c = Math.min(99, Math.max(1, p.confidence)) / 100;
    const rest = (1 - c) / (options.length - 1);
    for (const o of options) totals.set(o.id, totals.get(o.id)! + (o.id === p.optionId ? c : rest));
  }
  for (const [k, v] of totals) totals.set(k, v / graded.length);
  return totals;
}

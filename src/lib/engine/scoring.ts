/** One graded prediction: a settled, non-void position. */
export type Graded = {
  userId: string;
  betId: string;
  category: string;
  kind: "binary" | "multi" | "challenge";
  isPublic: boolean;
  /** 1–99 */
  confidence: number;
  hit: boolean;
  netCents: number;
  stakedCents: number;
  money: boolean;
  settledAt: number;
  /** Share of the pool that was on this person's side when it settled (0–1). */
  sideShare: number;
};

export const brier = (confidence: number, hit: boolean) => {
  const p = Math.min(99, Math.max(1, confidence)) / 100;
  return (p - (hit ? 1 : 0)) ** 2;
};

/** Below this many graded calls, rankings are labelled provisional. */
export const MIN_GRADED = 3;

export type CalibrationBucket = { lo: number; hi: number; n: number; predicted: number; actual: number };

const BUCKETS: [number, number][] = [
  [1, 50],
  [50, 60],
  [60, 70],
  [70, 80],
  [80, 90],
  [90, 100],
];

export type ForecasterStats = {
  userId: string;
  n: number;
  wins: number;
  losses: number;
  winRate: number;
  brier: number | null;
  /** 1 − Brier/0.25: 0 = coin flip, 1 = perfect, negative = worse than guessing. */
  skill: number | null;
  netCents: number;
  stakedCents: number;
  roi: number | null;
  streak: number; // +3 = three wins in a row, -2 = two losses
  bestStreak: number;
  upsets: number; // wins while holding ≤35% of the pool
  calibration: CalibrationBucket[];
  provisional: boolean;
};

export function statsFor(userId: string, graded: Graded[]): ForecasterStats {
  const mine = graded.filter((g) => g.userId === userId).sort((a, b) => a.settledAt - b.settledAt);
  const n = mine.length;
  const wins = mine.filter((g) => g.hit).length;
  const b = n ? mine.reduce((a, g) => a + brier(g.confidence, g.hit), 0) / n : null;
  const money = mine.filter((g) => g.money);
  const net = money.reduce((a, g) => a + g.netCents, 0);
  const staked = money.reduce((a, g) => a + g.stakedCents, 0);

  let streak = 0;
  let best = 0;
  let run = 0;
  for (const g of mine) {
    run = g.hit ? Math.max(1, run + 1) : Math.min(-1, run - 1);
    best = Math.max(best, run);
  }
  streak = run;

  const calibration = BUCKETS.map(([lo, hi]) => {
    const inB = mine.filter((g) => g.confidence >= lo && (g.confidence < hi || (hi === 100 && g.confidence <= 99)));
    return {
      lo,
      hi,
      n: inB.length,
      predicted: inB.length ? inB.reduce((a, g) => a + g.confidence, 0) / inB.length / 100 : (lo + hi) / 200,
      actual: inB.length ? inB.filter((g) => g.hit).length / inB.length : 0,
    };
  });

  return {
    userId,
    n,
    wins,
    losses: n - wins,
    winRate: n ? wins / n : 0,
    brier: b,
    skill: b === null ? null : 1 - b / 0.25,
    netCents: net,
    stakedCents: staked,
    roi: staked > 0 ? net / staked : null,
    streak,
    bestStreak: best,
    upsets: mine.filter((g) => g.hit && g.sideShare <= 0.35).length,
    calibration,
    provisional: n < MIN_GRADED,
  };
}

export function categoryBreakdown(userId: string, graded: Graded[]) {
  const mine = graded.filter((g) => g.userId === userId);
  const cats = new Map<string, Graded[]>();
  for (const g of mine) cats.set(g.category, [...(cats.get(g.category) ?? []), g]);
  return [...cats]
    .map(([category, gs]) => {
      const s = statsFor(userId, gs);
      return { category, n: s.n, winRate: s.winRate, skill: s.skill, netCents: s.netCents };
    })
    .sort((a, b) => b.n - a.n);
}

/** Ranking key per metric; higher is better. Provisional forecasters sort last. */
export function rankBy<T extends ForecasterStats>(metric: "skill" | "profit" | "winrate", stats: T[]): T[] {
  const key = (s: ForecasterStats) =>
    metric === "skill" ? (s.skill ?? -Infinity) : metric === "profit" ? s.netCents : s.winRate;
  return [...stats].sort((a, b) => {
    if (metric !== "profit" && a.provisional !== b.provisional) return a.provisional ? 1 : -1;
    return key(b) - key(a) || b.n - a.n || a.userId.localeCompare(b.userId);
  });
}

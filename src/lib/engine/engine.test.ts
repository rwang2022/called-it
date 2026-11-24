import { describe, expect, it } from "vitest";
import { computePayouts, crowdForecast, distribute, poolStats, type PayoutPosition } from "./payout";
import { computeBalances, simplifyDebts } from "./ledger";
import { brier, rankBy, statsFor, type Graded } from "./scoring";
import { onProbation, rateBet, scoreBet, type RatingInput } from "./rating";
import {
  canCancel,
  canJudge,
  canPropose,
  canReview,
  canTakePosition,
  decideDisputed,
  decideProposed,
  phaseOf,
  reviewersOf,
  subjectMayPick,
  validateOutcome,
  CLAUDE_ID,
  DAY,
  HOUR,
  type RuleBet,
} from "./rules";

const pos = (id: string, userId: string, optionId: string | null, amountCents: number, createdAt = 0): PayoutPosition => ({
  id,
  userId,
  optionId,
  amountCents,
  createdAt,
});
const sum = (xs: { netCents: number }[]) => xs.reduce((a, x) => a + x.netCents, 0);

describe("distribute", () => {
  it("splits exactly and deterministically", () => {
    expect(distribute(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(distribute(1000, [1, 3])).toEqual([250, 750]);
    expect(distribute(1, [1, 1])).toEqual([1, 0]);
    expect(distribute(0, [5, 5])).toEqual([0, 0]);
    expect(distribute(10, [0, 0])).toEqual([0, 0]);
  });
  it("never gives leftover cents to zero weights", () => {
    expect(distribute(7, [0, 1, 1])).toEqual([0, 4, 3]);
  });
  it("always sums to total", () => {
    for (let t = 0; t < 200; t++) {
      const weights = Array.from({ length: 1 + (t % 6) }, (_, i) => ((t * 7 + i * 13) % 50) + 1);
      const total = (t * 97) % 10007;
      expect(distribute(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe("computePayouts — pari-mutuel", () => {
  it("1 vs 2 on yes/no: the lone winner wins at most their own stake; the rest is refunded", () => {
    const r = computePayouts("binary", [pos("a", "sam", "yes", 2000), pos("b", "alex", "no", 2000), pos("c", "jo", "no", 2000)], {
      type: "option",
      optionId: "yes",
    });
    expect(r.find((x) => x.userId === "sam")!.netCents).toBe(2000);
    expect(r.find((x) => x.userId === "alex")!.netCents).toBe(-1000);
    expect(r.find((x) => x.userId === "jo")!.netCents).toBe(-1000);
    expect(sum(r)).toBe(0);
  });
  it("a $1 bet can't take someone's whole $10", () => {
    const r = computePayouts("binary", [pos("a", "big", "yes", 1000), pos("b", "sniper", "no", 100)], { type: "option", optionId: "no" });
    expect(r.find((x) => x.userId === "sniper")!.netCents).toBe(100);
    expect(r.find((x) => x.userId === "big")!.netCents).toBe(-100);
  });
  it("multiple choice: an underdog can win up to (options − 1)× their stake", () => {
    const ps = [pos("a", "dog", "x", 100), pos("b", "u2", "y", 1000), pos("c", "u3", "z", 1000), pos("d", "u4", "w", 1000), pos("e", "u5", "v", 1000)];
    const r = computePayouts("multi", ps, { type: "option", optionId: "x" }, 5);
    expect(r.find((x) => x.userId === "dog")!.netCents).toBe(400);
    expect(sum(r)).toBe(0);
    for (const x of r) expect(x.netCents).toBeGreaterThanOrEqual(-x.stakedCents);
  });
  it("winners split the losing pool pro-rata", () => {
    const r = computePayouts("binary", [pos("a", "sam", "yes", 1000), pos("b", "alex", "no", 1000), pos("c", "jo", "no", 3000)], {
      type: "option",
      optionId: "no",
    });
    expect(r.find((x) => x.userId === "alex")!.netCents).toBe(250);
    expect(r.find((x) => x.userId === "jo")!.netCents).toBe(750);
    expect(r.find((x) => x.userId === "sam")!.netCents).toBe(-1000);
  });
  it("odd cents still sum to zero", () => {
    const r = computePayouts(
      "multi",
      [pos("a", "u1", "x", 333), pos("b", "u2", "x", 333), pos("c", "u3", "x", 334), pos("d", "u4", "y", 1001), pos("e", "u5", "z", 1)],
      { type: "option", optionId: "x" },
    );
    expect(sum(r)).toBe(0);
    for (const x of r) expect(x.netCents).toBeGreaterThanOrEqual(-x.stakedCents);
  });
  it("refunds when nobody backed the winner, but still grades picks", () => {
    const r = computePayouts("multi", [pos("a", "u1", "x", 500), pos("b", "u2", "y", 500)], { type: "option", optionId: "z" });
    expect(r.every((x) => x.netCents === 0)).toBe(true);
    expect(r.every((x) => x.result === "loss")).toBe(true);
  });
  it("refunds when everyone is on the same side", () => {
    const r = computePayouts("binary", [pos("a", "u1", "yes", 500), pos("b", "u2", "yes", 900)], { type: "option", optionId: "yes" });
    expect(r.every((x) => x.netCents === 0 && x.result === "win")).toBe(true);
  });
  it("zero-stake players (Claude) are graded but never move money", () => {
    const r = computePayouts("binary", [pos("a", "u1", "yes", 1000), pos("b", "u2", "no", 1000), pos("c", "claude", "yes", 0)], {
      type: "option",
      optionId: "yes",
    });
    expect(r.find((x) => x.userId === "claude")).toMatchObject({ netCents: 0, result: "win" });
    expect(r.find((x) => x.userId === "u1")!.netCents).toBe(1000);
  });
  it("void refunds everyone", () => {
    const r = computePayouts("binary", [pos("a", "u1", "yes", 1000), pos("b", "u2", "no", 1000)], { type: "void" });
    expect(r.every((x) => x.netCents === 0 && x.result === "push")).toBe(true);
  });
  it("rejects mismatched outcome shapes", () => {
    expect(() => computePayouts("binary", [pos("a", "u1", "yes", 1)], { type: "challenge", results: {} })).toThrow();
  });
});

describe("computePayouts — challenges", () => {
  const ps = [pos("p1", "x", null, 2500), pos("p2", "y", null, 2500)];
  it("whoever fails pays whoever succeeds", () => {
    const r = computePayouts("challenge", ps, { type: "challenge", results: { p1: "pass", p2: "fail" } });
    expect(r.find((x) => x.userId === "x")!.netCents).toBe(2500);
    expect(r.find((x) => x.userId === "y")!.netCents).toBe(-2500);
  });
  it("both succeed or both fail: nobody owes", () => {
    for (const both of ["pass", "fail"] as const) {
      const r = computePayouts("challenge", ps, { type: "challenge", results: { p1: both, p2: both } });
      expect(r.every((x) => x.netCents === 0 && x.result === "push")).toBe(true);
    }
  });
  it("N-way: each failer loses exactly their stake, split across passers", () => {
    const three = [...ps, pos("p3", "z", null, 2500)];
    const r = computePayouts("challenge", three, { type: "challenge", results: { p1: "pass", p2: "fail", p3: "pass" } });
    expect(r.find((x) => x.userId === "y")!.netCents).toBe(-2500);
    expect(r.find((x) => x.userId === "x")!.netCents).toBe(1250);
    expect(sum(r)).toBe(0);
  });
  it("requires a result for every participant", () => {
    expect(() => computePayouts("challenge", ps, { type: "challenge", results: { p1: "pass" } })).toThrow();
  });
});

describe("pool stats & crowd", () => {
  it("computes shares and multipliers", () => {
    const s = poolStats(
      [{ id: "yes" }, { id: "no" }],
      [
        { optionId: "yes", amountCents: 1000 },
        { optionId: "no", amountCents: 3000 },
      ],
    );
    // Yes/no caps the payout at even money: $1 returns at most $2.
    expect(s[0]).toMatchObject({ share: 0.25, multiplier: 2 });
    expect(s[1].multiplier).toBeCloseTo(4 / 3);
  });
  it("crowd forecast averages beliefs", () => {
    const c = crowdForecast(
      [{ id: "yes" }, { id: "no" }],
      [
        { optionId: "yes", confidence: 80 },
        { optionId: "no", confidence: 60 },
      ],
    )!;
    expect(c.get("yes")).toBeCloseTo(0.6);
    expect(c.get("no")).toBeCloseTo(0.4);
  });
});

describe("ledger", () => {
  it("nets settlements and payments, then simplifies", () => {
    const bal = computeBalances(
      [
        { userId: "a", netCents: 3000 },
        { userId: "b", netCents: -1000 },
        { userId: "c", netCents: -2000 },
        { userId: "a", netCents: -500 },
        { userId: "b", netCents: 500 },
      ],
      [{ fromId: "c", toId: "a", amountCents: 1000 }],
    );
    expect(bal.get("a")).toBe(1500);
    expect(bal.get("b")).toBe(-500);
    expect(bal.get("c")).toBe(-1000);
    const t = simplifyDebts(bal);
    expect(t).toEqual([
      { from: "c", to: "a", amountCents: 1000 },
      { from: "b", to: "a", amountCents: 500 },
    ]);
  });
  it("uses at most n-1 transfers and conserves money", () => {
    const bal = new Map([
      ["a", 700],
      ["b", -300],
      ["c", -300],
      ["d", -100],
      ["e", 0],
    ]);
    const t = simplifyDebts(bal);
    expect(t.length).toBeLessThanOrEqual(4);
    expect(t.reduce((s, x) => s + x.amountCents, 0)).toBe(700);
  });
});

describe("scoring", () => {
  const g = (userId: string, confidence: number, hit: boolean, i: number, extra: Partial<Graded> = {}): Graded => ({
    userId,
    betId: `b${i}`,
    category: "markets",
    kind: "binary",
    isPublic: true,
    confidence,
    hit,
    netCents: hit ? 100 : -100,
    stakedCents: 100,
    money: true,
    settledAt: i,
    sideShare: 0.5,
    rated: true,
    edge: null,
    ...extra,
  });
  it("brier is 0 for confident hits and 1 for confident misses (clamped)", () => {
    expect(brier(99, true)).toBeCloseTo(0.0001);
    expect(brier(99, false)).toBeCloseTo(0.9801);
    expect(brier(50, true)).toBeCloseTo(0.25);
  });
  it("computes streaks, ROI and skill", () => {
    const s = statsFor("u", [g("u", 70, true, 1), g("u", 70, true, 2), g("u", 70, false, 3), g("u", 70, true, 4), g("u", 70, true, 5), g("u", 70, true, 6)]);
    expect(s.wins).toBe(5);
    expect(s.streak).toBe(3);
    expect(s.bestStreak).toBe(3);
    expect(s.roi).toBeCloseTo(4 / 6);
    expect(s.skill).toBeGreaterThan(0);
  });
  it("only rated calls count toward the record; money counts everything", () => {
    const s = statsFor("u", [g("u", 90, true, 1), g("u", 90, true, 2, { rated: false }), g("u", 90, false, 3, { rated: false })]);
    expect(s.n).toBe(1);
    expect(s.unrated).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.netCents).toBe(100);
  });
  it("ranks by edge, provisional forecasters last", () => {
    const e = (u: string, edge: number, i: number) => g(u, 70, true, i, { edge });
    const graded = [e("a", 0.02, 1), e("a", 0.02, 2), e("a", 0.02, 3), e("b", 0.1, 4), e("b", 0.1, 5), e("b", 0.1, 6)];
    expect(rankBy("skill", [statsFor("a", graded), statsFor("b", graded)])[0].userId).toBe("b");
  });
  it("ranks provisional forecasters last", () => {
    const graded = [g("pro", 60, true, 1), g("pro", 60, true, 2), g("pro", 60, false, 3), g("lucky", 99, true, 4)];
    const ranked = rankBy("skill", [statsFor("pro", graded), statsFor("lucky", graded)]);
    expect(ranked[0].userId).toBe("pro");
  });
});

describe("rules", () => {
  const now = Date.UTC(2026, 10, 20);
  const bet = (over: Partial<RuleBet> = {}): RuleBet => ({
    creatorId: "c",
    judgeMode: "creator",
    judgeId: null,
    subjectId: null,
    status: "open",
    closesAt: new Date(now + DAY),
    resolvesAt: new Date(now + 2 * DAY),
    proposedById: null,
    proposalVersion: 0,
    reviewDeadline: null,
    voteDeadline: null,
    claudeResolve: "none",
    kind: "binary",
    isPublic: false,
    ...over,
  });

  it("derives phases from time", () => {
    expect(phaseOf(bet(), now)).toBe("open");
    expect(phaseOf(bet(), now + 1.5 * DAY)).toBe("locked");
    expect(phaseOf(bet(), now + 3 * DAY)).toBe("awaiting");
    expect(phaseOf(bet({ status: "settled" }), now)).toBe("settled");
  });

  it("neutral judges can't bet; subjects can only back themselves", () => {
    expect(canTakePosition(bet({ judgeMode: "person", judgeId: "j" }), "j", now).ok).toBe(false);
    expect(canTakePosition(bet(), "claude", now).ok).toBe(false);
    expect(canTakePosition(bet(), "x", now + 2 * DAY).ok).toBe(false);
    expect(subjectMayPick(bet({ subjectId: "sam" }), "sam", 1).ok).toBe(false);
    expect(subjectMayPick(bet({ subjectId: "sam" }), "sam", 0).ok).toBe(true);
  });

  it("Claude judges public bets; creator can step in if Claude fails", () => {
    const b = bet({ judgeMode: "claude", isPublic: true });
    expect(canJudge(b, "claude", now)).toBe(true);
    expect(canJudge(b, "c", now)).toBe(false);
    expect(canJudge({ ...b, claudeResolve: "failed" }, "c", now)).toBe(true);
    expect(canJudge(b, "c", now + 6 * DAY)).toBe(true);
  });

  it("reviewers exclude the caller and Claude", () => {
    const positions = [{ userId: "c" }, { userId: "a" }, { userId: "claude" }, { userId: "a" }];
    expect(reviewersOf(bet({ proposedById: "c" }), positions)).toEqual(["a"]);
  });

  it("settles when all confirm, or after the window", () => {
    const b = bet({ status: "proposed", proposedById: "c", proposalVersion: 1, reviewDeadline: new Date(now + DAY) });
    const positions = [{ userId: "c" }, { userId: "a" }, { userId: "b" }];
    expect(decideProposed(b, positions, [], now)).toBe("wait");
    expect(decideProposed(b, positions, [{ userId: "a", proposalVersion: 1, kind: "confirm" }], now)).toBe("wait");
    expect(
      decideProposed(
        b,
        positions,
        [
          { userId: "a", proposalVersion: 1, kind: "confirm" },
          { userId: "b", proposalVersion: 1, kind: "confirm" },
        ],
        now,
      ),
    ).toBe("settle");
    // stale-version reviews don't count
    expect(decideProposed(b, positions, [{ userId: "a", proposalVersion: 0, kind: "confirm" }, { userId: "b", proposalVersion: 0, kind: "confirm" }], now)).toBe("wait");
    expect(decideProposed(b, positions, [], now + DAY)).toBe("settle");
    expect(decideProposed(b, [{ userId: "c" }], [], now)).toBe("settle");
  });

  it("disputes resolve by majority, ties void", () => {
    const b = bet({ status: "disputed", proposedById: "c", proposalVersion: 1, voteDeadline: new Date(now + DAY) });
    const positions = [{ userId: "c" }, { userId: "a" }, { userId: "b" }, { userId: "d" }, { userId: "e" }];
    const r = (userId: string, kind: "confirm" | "dispute") => ({ userId, proposalVersion: 1, kind });
    expect(decideDisputed(b, positions, [r("a", "dispute")], now)).toBe("wait");
    expect(decideDisputed(b, positions, [r("a", "dispute"), r("b", "dispute"), r("d", "dispute")], now)).toBe("void");
    // 2 of 4 is not a strict majority: keep waiting
    expect(decideDisputed(b, positions, [r("a", "dispute"), r("b", "confirm"), r("d", "confirm")], now)).toBe("wait");
    expect(decideDisputed(b, positions, [r("a", "dispute"), r("b", "confirm"), r("d", "confirm"), r("e", "confirm")], now)).toBe("settle");
    expect(decideDisputed(b, positions, [r("a", "dispute"), r("b", "confirm")], now + DAY)).toBe("void");
    expect(decideDisputed(b, positions, [r("a", "dispute"), r("b", "confirm"), r("d", "confirm")], now + DAY)).toBe("settle");
  });

  it("guards proposals, reviews and cancellation", () => {
    expect(canPropose(bet(), "a", now, 2).ok).toBe(false);
    expect(canPropose(bet(), "c", now, 0).ok).toBe(false);
    expect(canPropose(bet(), "c", now, 2).ok).toBe(true);
    expect(canCancel(bet(), [{ userId: "c" }, { userId: "claude" }], "c").ok).toBe(true);
    expect(canCancel(bet(), [{ userId: "c" }, { userId: "a" }], "c").ok).toBe(false);
    const proposed = bet({ status: "proposed", proposedById: "c", proposalVersion: 1 });
    expect(canReview(proposed, [{ userId: "c" }, { userId: "a" }], [], "c").ok).toBe(false);
    expect(canReview(proposed, [{ userId: "c" }, { userId: "a" }], [], "a").ok).toBe(true);
    expect(canReview(proposed, [{ userId: "c" }, { userId: "a" }], [{ userId: "a", proposalVersion: 1, kind: "confirm" }], "a").ok).toBe(false);
  });

  it("validates outcomes", () => {
    expect(validateOutcome("binary", { type: "option", optionId: "x" }, ["x", "y"], []).ok).toBe(true);
    expect(validateOutcome("binary", { type: "option", optionId: "z" }, ["x", "y"], []).ok).toBe(false);
    expect(validateOutcome("challenge", { type: "challenge", results: { p1: "pass" } }, [], ["p1", "p2"]).ok).toBe(false);
    expect(validateOutcome("challenge", { type: "challenge", results: { p1: "pass", p2: "fail" } }, [], ["p1", "p2"]).ok).toBe(true);
    expect(validateOutcome("multi", { type: "void" }, [], []).ok).toBe(true);
  });
});

describe("rating — what counts toward scores", () => {
  const t0 = Date.UTC(2026, 10, 1);
  const f = (userId: string, optionId: string, confidence = 70, probation = false) => ({ userId, optionId, confidence, probation });
  const base = (over: Partial<RatingInput> = {}): RatingInput => ({
    createdAt: t0,
    closesAt: t0 + 2 * HOUR,
    proposedAt: t0 + 3 * HOUR,
    proposedById: "judge",
    settledVia: "window",
    forecasts: [f("a", "yes"), f("b", "no")],
    confirmedBy: [],
    ...over,
  });
  it("neutral judge, two forecasters, open 2h: rated", () => {
    expect(rateBet(base()).status).toBe("rated");
  });
  it("a solo bet isn't rated", () => {
    expect(rateBet(base({ forecasts: [f("a", "yes")] })).status).toBe("unrated");
  });
  it("closing within an hour isn't rated, and neither is an early call", () => {
    expect(rateBet(base({ closesAt: t0 + 5 * 60_000 })).status).toBe("unrated");
    expect(rateBet(base({ proposedAt: t0 + 10 * 60_000 })).status).toBe("unrated");
  });
  it("judge with a stake, unconfirmed: only the judge's side is unrated; silence can't erase the other side's loss", () => {
    const r = rateBet(base({ proposedById: "a", forecasts: [f("a", "yes"), f("c", "yes"), f("b", "no")] }));
    expect(r.status).toBe("partial");
    expect(r.status === "partial" && r.unrated.sort()).toEqual(["a", "c"]);
  });
  it("an opponent's confirmation or a vote makes it fully rated; an ally's doesn't", () => {
    const self = { proposedById: "a", forecasts: [f("a", "yes"), f("c", "yes"), f("b", "no")] };
    expect(rateBet(base({ ...self, confirmedBy: ["b"] })).status).toBe("rated");
    expect(rateBet(base({ ...self, settledVia: "vote" })).status).toBe("rated");
    expect(rateBet(base({ ...self, confirmedBy: ["c"] })).status).toBe("partial");
  });
  it("a judge who rules against their own pick has no conflict: fully rated", () => {
    const self = { proposedById: "a", forecasts: [f("a", "yes"), f("c", "yes"), f("b", "no")] };
    expect(rateBet(base(self), "no").status).toBe("rated");
    expect(rateBet(base(self), "yes").status).toBe("partial");
  });
  it("judge with a stake and everyone on their side: unrated", () => {
    expect(rateBet(base({ proposedById: "a", forecasts: [f("a", "yes"), f("c", "yes")] })).status).toBe("unrated");
  });
  it("Claude judging its own public bet is treated as neutral", () => {
    expect(rateBet(base({ proposedById: CLAUDE_ID, forecasts: [f(CLAUDE_ID, "yes"), f("b", "no")] })).status).toBe("rated");
  });
  it("new members don't count, and a bet against only a new member is unrated", () => {
    expect(rateBet(base({ forecasts: [f("a", "yes"), f("puppet", "no", 99, true)] })).status).toBe("unrated");
    const r = rateBet(base({ forecasts: [f("a", "yes"), f("b", "no"), f("puppet", "no", 99, true)] }));
    expect(r.status === "partial" && r.unrated).toEqual(["puppet"]);
  });
  it("new-member rule spares a group's founders", () => {
    const g = t0;
    expect(onProbation(g + 2 * DAY, g, g + 3 * DAY)).toBe(false); // joined in the founding week
    expect(onProbation(g + 30 * DAY, g, g + 31 * DAY)).toBe(true); // joined later, picked on day 1
    expect(onProbation(g + 30 * DAY, g, g + 38 * DAY)).toBe(false); // a week on
  });
});

describe("edge — scored against the room", () => {
  const t0 = Date.UTC(2026, 10, 1);
  const bet = (forecasts: RatingInput["forecasts"]): RatingInput => ({
    createdAt: t0, closesAt: t0 + 2 * HOUR, proposedAt: t0 + 3 * HOUR, proposedById: "judge", settledVia: "confirmed", forecasts, confirmedBy: [],
  });
  it("everyone calling a sure thing earns ~0", () => {
    const { picks } = scoreBet(bet([{ userId: "a", optionId: "yes", confidence: 99 }, { userId: "b", optionId: "yes", confidence: 99 }]), "yes");
    expect(picks[0].edge).toBeCloseTo(0);
  });
  it("is zero-sum between two people, and edgeFrom adds up to edge", () => {
    const { picks } = scoreBet(bet([{ userId: "a", optionId: "yes", confidence: 80 }, { userId: "b", optionId: "yes", confidence: 30 }]), "yes");
    expect(picks[0].edge! + picks[1].edge!).toBeCloseTo(0);
    expect(picks[0].edge).toBeGreaterThan(0);
    expect(picks[0].edgeFrom.b).toBeCloseTo(picks[0].edge!);
  });
  it("a new member's 99% wrong pick feeds nobody", () => {
    const { picks } = scoreBet(
      bet([{ userId: "a", optionId: "yes", confidence: 70 }, { userId: "b", optionId: "yes", confidence: 70 }, { userId: "puppet", optionId: "no", confidence: 99, probation: true }]),
      "yes",
    );
    expect(picks[0].edge).toBeCloseTo(0);
    expect(picks[2].rated).toBe(false);
  });
});

describe("edge sources", () => {
  it("flags edge mostly won from one person", () => {
    const g = (i: number, from: Record<string, number>): Graded => ({
      userId: "farmer", betId: `b${i}`, category: "life", kind: "binary", isPublic: false, confidence: 90, hit: true,
      netCents: 0, stakedCents: 0, money: false, settledAt: i, sideShare: 0.5, rated: true,
      edge: Object.values(from).reduce((a, x) => a + x, 0), edgeFrom: from,
    });
    const graded = [1, 2, 3, 4, 5].map((i) => g(i, { puppet: 0.4, jo: 0.02 }));
    expect(statsFor("farmer", graded).edgeSource?.userId).toBe("puppet");
    const fair = [1, 2, 3, 4, 5].map((i) => g(i, { a: 0.1, b: 0.1, c: 0.1 }));
    expect(statsFor("farmer", fair).edgeSource).toBeNull();
  });
});

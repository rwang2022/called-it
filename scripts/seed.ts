/**
 * Local demo data: six friends, two groups, a few months of settled history,
 * and live bets in every lifecycle state. Refuses to run against a remote DB.
 *
 *   npm run db:seed      (or `npm run db:reset` to wipe + migrate + seed)
 */
import { config } from "dotenv";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/lib/db/schema";
import { computePayouts } from "../src/lib/engine/payout";
import { newId, newInviteCode } from "../src/lib/ids";
import { dbConfig } from "../src/lib/db/env";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const { url } = dbConfig();
if (!url.startsWith("file:")) {
  console.error("Refusing to seed a non-local database. Seed data is for local dev only.");
  process.exit(1);
}
const client = createClient({ url });
const db = drizzle(client, { schema });
const { users, groups, groupMembers, bets, betOptions, positions, settlements, activity, reviews, payments, comments } = schema;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();
const at = (days: number) => new Date(NOW + days * DAY);

const people = {
  alex: { id: "dev_alex", name: "Alex Rivera", email: "alex@example.com" },
  sam: { id: "dev_sam", name: "Sam Okafor", email: "sam@example.com" },
  jo: { id: "dev_jo", name: "Jo Park", email: "jo@example.com" },
  priya: { id: "dev_priya", name: "Priya Shah", email: "priya@example.com" },
  ben: { id: "dev_ben", name: "Ben Carter", email: "ben@example.com" },
  maya: { id: "dev_maya", name: "Maya Lin", email: "maya@example.com" },
};
type P = keyof typeof people | "claude";
const uid = (p: P) => (p === "claude" ? "claude" : people[p].id);

type Pos = { who: P; opt?: number; amt?: number; conf: number; note?: string; task?: string };
type Spec = {
  group: string;
  creator: P;
  title: string;
  description?: string;
  criteria?: string;
  category: string;
  kind: schema.BetKind;
  money?: boolean;
  stake?: number;
  custom?: boolean;
  isPublic?: boolean;
  subject?: P;
  judge?: P | "creator" | "claude";
  created: number;
  closes: number;
  resolves: number;
  options?: string[];
  positions: Pos[];
  outcome?: { opt: number } | { results: ("pass" | "fail")[] } | "void";
  via?: "confirmed" | "window" | "vote";
  state?: "proposed" | "disputed";
  opponent?: P;
  opponentTask?: string;
  reviews?: { who: P; kind: "confirm" | "dispute"; reason?: string }[];
  talk?: { who: P; body: string; ago: number }[];
};

async function makeBet(s: Spec) {
  const id = newId();
  const kindOptions = s.kind === "binary" ? ["Yes", "No"] : (s.options ?? []);
  const opts = kindOptions.map((label, i) => ({ id: newId(), betId: id, label, sortOrder: i }));
  const money = s.money ?? true;
  const judgeMode: schema.JudgeMode =
    !s.judge || s.judge === "creator" ? "creator" : s.judge === "claude" ? "claude" : "person";
  const judgeId = judgeMode === "person" ? uid(s.judge as P) : null;
  const caller = judgeMode === "creator" ? uid(s.creator) : judgeMode === "claude" ? "claude" : judgeId!;
  const createdAt = at(s.created);

  const posRows = s.positions.map((p, i) => ({
    id: newId(),
    betId: id,
    userId: uid(p.who),
    optionId: p.opt === undefined ? null : opts[p.opt].id,
    amountCents: p.who === "claude" || !money ? 0 : (p.amt ?? s.stake ?? 0),
    confidence: p.conf,
    note: p.note ?? null,
    task: p.task ?? null,
    sources: p.who === "claude" ? [{ title: "Demo source", url: "https://example.com" }] : null,
    createdAt: new Date(createdAt.getTime() + (i + 1) * 3 * HOUR),
    updatedAt: new Date(createdAt.getTime() + (i + 1) * 3 * HOUR),
  }));

  let outcome: schema.Outcome | null = null;
  if (s.outcome === "void") outcome = { type: "void" };
  else if (s.outcome && "opt" in s.outcome) outcome = { type: "option", optionId: opts[s.outcome.opt].id };
  else if (s.outcome && "results" in s.outcome) {
    const res = s.outcome.results;
    outcome = { type: "challenge", results: Object.fromEntries(posRows.map((p, i) => [p.id, res[i]])) };
  }

  const resolvesAt = at(s.resolves);
  const proposedAt = new Date(Math.min(NOW - HOUR, resolvesAt.getTime() + 5 * HOUR));
  const settled = Boolean(outcome) && !s.state;
  const settledAt = settled ? new Date(Math.min(NOW - HOUR / 2, proposedAt.getTime() + 20 * HOUR)) : null;

  await db.insert(bets).values({
    id,
    groupId: s.group,
    creatorId: uid(s.creator),
    title: s.title,
    description: s.description ?? null,
    criteria: s.criteria ?? null,
    category: s.category,
    kind: s.kind,
    stakeMode: money ? "money" : "bragging",
    stakeCents: money ? (s.stake ?? 0) : 0,
    customStakes: money && (s.custom ?? false),
    isPublic: s.isPublic ?? false,
    subjectId: s.subject ? uid(s.subject) : null,
    challengeOpponentId: s.opponent ? uid(s.opponent) : null,
    challengeOpponentTask: s.opponentTask ?? null,
    closesAt: at(s.closes),
    resolvesAt,
    judgeMode,
    judgeId,
    status: s.state ?? (settled ? "settled" : "open"),
    proposal: outcome,
    proposalNote: outcome ? (judgeMode === "claude" ? "Demo: verified against the closing price on the resolution date." : null) : null,
    proposalVersion: outcome ? 1 : 0,
    proposedById: outcome ? caller : null,
    proposedAt: outcome ? proposedAt : null,
    reviewDeadline: outcome ? new Date(proposedAt.getTime() + DAY) : null,
    disputedAt: s.state === "disputed" ? new Date(proposedAt.getTime() + 2 * HOUR) : null,
    voteDeadline: s.state === "disputed" ? new Date(proposedAt.getTime() + 50 * HOUR) : null,
    outcome: settled ? outcome : null,
    settledAt,
    settledVia: settled ? (s.via ?? "confirmed") : null,
    claudePredict: posRows.some((p) => p.userId === "claude") ? "done" : "none",
    claudeResolve: judgeMode === "claude" && settled ? "done" : "none",
    createdAt,
    updatedAt: settledAt ?? createdAt,
  });
  if (opts.length) await db.insert(betOptions).values(opts);
  if (posRows.length) await db.insert(positions).values(posRows);

  await db.insert(activity).values({ id: newId(), groupId: s.group, betId: id, actorId: uid(s.creator), type: "bet_created", createdAt });
  for (const p of posRows) {
    if (p.userId === uid(s.creator)) continue;
    await db.insert(activity).values({
      id: newId(),
      groupId: s.group,
      betId: id,
      actorId: p.userId,
      type: p.userId === "claude" ? "claude_predicted" : s.kind === "challenge" ? "challenge_accepted" : "position_taken",
      createdAt: p.createdAt,
    });
  }

  if (settled && outcome) {
    const results = computePayouts(
      s.kind,
      posRows.map((p) => ({ id: p.id, userId: p.userId, optionId: p.optionId, amountCents: p.amountCents, createdAt: p.createdAt.getTime() })),
      outcome,
    );
    await db.insert(settlements).values(
      results.map((r) => ({
        betId: id,
        userId: r.userId,
        groupId: s.group,
        netCents: r.netCents,
        stakedCents: r.stakedCents,
        result: r.result,
        createdAt: settledAt!,
      })),
    );
    await db.insert(activity).values({ id: newId(), groupId: s.group, betId: id, type: "settled", data: { via: s.via ?? "confirmed" }, createdAt: settledAt! });
  }
  if (s.state && outcome) {
    await db.insert(activity).values({ id: newId(), groupId: s.group, betId: id, actorId: caller, type: "proposed", createdAt: proposedAt });
  }
  for (const r of s.reviews ?? []) {
    await db.insert(reviews).values({
      id: newId(),
      betId: id,
      userId: uid(r.who),
      proposalVersion: 1,
      kind: r.kind,
      vote: r.kind === "confirm" ? "uphold" : "void",
      reason: r.reason ?? null,
      createdAt: new Date(proposedAt.getTime() + 2 * HOUR),
    });
  }
  for (const t of s.talk ?? []) {
    await db.insert(comments).values({ id: newId(), betId: id, userId: uid(t.who), body: t.body, createdAt: new Date(NOW - t.ago * HOUR) });
  }
  return id;
}

async function main() {
  for (const p of Object.values(people)) {
    await db.insert(users).values({ id: p.id, name: p.name, email: p.email }).onConflictDoNothing();
  }
  await db.insert(users).values({ id: "claude", name: "Claude", isBot: true, image: "/claude-avatar.svg" }).onConflictDoNothing();

  const existing = await db.select().from(groups).all();
  if (existing.length > 0) {
    console.log("Database already has groups — skipping seed. Use `npm run db:reset` for a fresh start.");
    return;
  }

  const chat = newId();
  const gym = newId();
  await db.insert(groups).values([
    { id: chat, name: "The Group Chat", hue: 268, inviteCode: newInviteCode(), createdById: people.alex.id, createdAt: at(-160) },
    { id: gym, name: "Gym Rats", hue: 150, inviteCode: newInviteCode(), createdById: people.sam.id, createdAt: at(-120) },
  ]);
  const chatMembers: P[] = ["alex", "sam", "jo", "priya", "ben", "maya"];
  const gymMembers: P[] = ["sam", "alex", "ben"];
  await db.insert(groupMembers).values([
    ...chatMembers.map((m, i) => ({ groupId: chat, userId: uid(m), role: (i === 0 ? "owner" : "member") as "owner" | "member", joinedAt: at(-160 + i) })),
    ...gymMembers.map((m, i) => ({ groupId: gym, userId: uid(m), role: (i === 0 ? "owner" : "member") as "owner" | "member", joinedAt: at(-120 + i) })),
  ]);

  // ——— Settled history ———
  await makeBet({
    group: chat, creator: "alex", title: "Will Sam do a strict pull-up by Halloween?", category: "fitness", kind: "binary",
    stake: 2000, custom: true, subject: "sam", judge: "jo", created: -95, closes: -88, resolves: -20,
    criteria: "Dead hang start, chin over bar, no kipping. Video evidence required.",
    positions: [
      { who: "sam", opt: 0, amt: 2000, conf: 80, note: "Been doing negatives every day. Watch me." },
      { who: "alex", opt: 1, amt: 2000, conf: 70, note: "Respectfully, no." },
      { who: "priya", opt: 1, amt: 1000, conf: 60 },
      { who: "ben", opt: 0, amt: 1500, conf: 55 },
    ],
    outcome: { opt: 0 },
    talk: [{ who: "sam", body: "Video's in the group chat. Pay up 💪", ago: 24 * 19 }],
  });
  await makeBet({
    group: chat, creator: "priya", title: "Will FERN close above its $32 IPO price on its 3-month anniversary?", category: "markets", kind: "binary",
    stake: 2500, custom: true, isPublic: true, judge: "claude", created: -110, closes: -100, resolves: -14,
    description: "Fernwood Robotics (FERN) listed at $32. Closing price on the 3-month anniversary of the listing.",
    criteria: "Official closing price on the anniversary date. If markets are closed, use the prior close.",
    positions: [
      { who: "priya", opt: 0, amt: 2500, conf: 65 },
      { who: "alex", opt: 1, amt: 2500, conf: 60 },
      { who: "maya", opt: 0, amt: 1000, conf: 55 },
      { who: "claude", opt: 0, conf: 62, note: "(Demo data) Revenue guidance was raised twice since listing and lock-up selling looks priced in. Leaning yes, modestly." },
    ],
    outcome: { opt: 0 },
  });
  await makeBet({
    group: chat, creator: "jo", title: "Who wins fantasy league this season?", category: "sports", kind: "multi",
    options: ["Ben", "Alex", "Maya", "Jo"], stake: 1000, created: -150, closes: -140, resolves: -40, judge: "priya",
    positions: [
      { who: "jo", opt: 3, conf: 45 },
      { who: "ben", opt: 0, conf: 50, note: "It's my year." },
      { who: "alex", opt: 1, conf: 40 },
      { who: "maya", opt: 0, conf: 35 },
      { who: "sam", opt: 2, conf: 30 },
    ],
    outcome: { opt: 0 },
  });
  await makeBet({
    group: gym, creator: "ben", title: "Sam: 100 push-ups in 5 min. Alex: plank for 4 min. Whoever fails buys protein.", category: "fitness", kind: "challenge",
    stake: 3000, created: -70, closes: -66, resolves: -60, judge: "creator",
    positions: [
      { who: "sam", conf: 75, task: "100 push-ups in under 5 minutes" },
      { who: "alex", conf: 70, task: "Hold a plank for 4 minutes" },
    ],
    outcome: { results: ["pass", "fail"] },
  });
  await makeBet({
    group: chat, creator: "maya", title: "Will it snow in the city before Thanksgiving?", category: "science", kind: "binary",
    money: false, isPublic: true, created: -60, closes: -50, resolves: -5, judge: "creator",
    positions: [
      { who: "maya", opt: 1, conf: 70 },
      { who: "jo", opt: 0, conf: 60 },
      { who: "ben", opt: 1, conf: 65 },
      { who: "claude", opt: 1, conf: 72, note: "(Demo data) Pre-Thanksgiving measurable snow has happened in only a handful of recent years; forecasts show a mild pattern." },
    ],
    outcome: { opt: 1 },
  });
  await makeBet({
    group: chat, creator: "alex", title: "Will Ben actually finish reading Infinite Jest this year?", category: "life", kind: "binary",
    stake: 1000, custom: true, subject: "ben", judge: "maya", created: -130, closes: -120, resolves: -30,
    positions: [
      { who: "ben", opt: 0, amt: 1000, conf: 75, note: "Footnotes and all." },
      { who: "alex", opt: 1, amt: 1000, conf: 85 },
      { who: "jo", opt: 1, amt: 500, conf: 75 },
      { who: "sam", opt: 1, amt: 500, conf: 70 },
    ],
    outcome: { opt: 1 },
    talk: [{ who: "ben", body: "Page 612. So close.", ago: 24 * 29 }],
  });
  await makeBet({
    group: chat, creator: "sam", title: "Which film takes the festival's top prize?", category: "culture", kind: "multi",
    options: ["The Long Field", "Blue Hour", "Copperhead", "Something else"], stake: 500, isPublic: true, judge: "creator",
    created: -80, closes: -72, resolves: -50,
    positions: [
      { who: "sam", opt: 1, conf: 40 },
      { who: "priya", opt: 0, conf: 45 },
      { who: "maya", opt: 1, conf: 50 },
      { who: "claude", opt: 1, conf: 38, note: "(Demo data) Blue Hour swept the precursor awards, though jury picks are notoriously noisy." },
    ],
    outcome: { opt: 1 },
  });
  await makeBet({
    group: chat, creator: "priya", title: "Will Jo keep a 30-day Duolingo streak?", category: "life", kind: "binary",
    stake: 1500, subject: "jo", judge: "creator", created: -45, closes: -44, resolves: -12,
    positions: [
      { who: "jo", opt: 0, conf: 70 },
      { who: "priya", opt: 1, conf: 55 },
      { who: "alex", opt: 0, conf: 60 },
      { who: "maya", opt: 1, conf: 60 },
    ],
    outcome: { opt: 0 },
    via: "window",
  });
  await makeBet({
    group: gym, creator: "alex", title: "Will Ben hit a 315 lb deadlift by the end of the block?", category: "fitness", kind: "binary",
    stake: 2000, subject: "ben", judge: "sam", created: -58, closes: -50, resolves: -9,
    positions: [
      { who: "ben", opt: 0, conf: 65 },
      { who: "alex", opt: 1, conf: 60 },
    ],
    outcome: { opt: 1 },
  });
  await makeBet({
    group: chat, creator: "ben", title: "Will the new ramen place be open by the 1st?", category: "other", kind: "binary",
    stake: 1000, judge: "creator", created: -35, closes: -30, resolves: -25,
    positions: [
      { who: "ben", opt: 0, conf: 60 },
      { who: "sam", opt: 1, conf: 75 },
      { who: "jo", opt: 1, conf: 65 },
    ],
    outcome: { opt: 1 },
  });
  await makeBet({
    group: chat, creator: "maya", title: "Will ACME's earnings beat consensus EPS?", category: "markets", kind: "binary",
    stake: 2000, custom: true, isPublic: true, judge: "claude", created: -40, closes: -33, resolves: -26,
    positions: [
      { who: "maya", opt: 0, amt: 2000, conf: 70 },
      { who: "ben", opt: 1, amt: 1000, conf: 55 },
      { who: "priya", opt: 0, amt: 1500, conf: 60 },
      { who: "claude", opt: 0, conf: 74, note: "(Demo data) They've beaten consensus 7 of the last 8 quarters and channel checks were strong." },
    ],
    outcome: { opt: 0 },
  });

  // ——— Live bets ———
  await makeBet({
    group: chat, creator: "alex", title: "Will Sam do 10 unbroken pull-ups by New Year's Eve?", category: "fitness", kind: "binary",
    stake: 2500, custom: true, subject: "sam", judge: "jo", created: -6, closes: 9, resolves: 41,
    description: "Round two. Last time he got one. Now we go to ten.",
    criteria: "Ten strict reps, dead hang between each rep, filmed in one take.",
    positions: [
      { who: "sam", opt: 0, amt: 5000, conf: 70, note: "Double or nothing energy." },
      { who: "alex", opt: 1, amt: 2500, conf: 65 },
      { who: "ben", opt: 1, amt: 2000, conf: 60 },
      { who: "maya", opt: 0, amt: 1000, conf: 55 },
    ],
    talk: [
      { who: "alex", body: "One pull-up ≠ ten pull-ups my guy", ago: 30 },
      { who: "sam", body: "Screenshot this.", ago: 28 },
    ],
  });
  await makeBet({
    group: gym, creator: "alex", title: "Alex runs a sub-25 5K. Ben does 50 unbroken push-ups. Whoever can't, owes the other $40.", category: "fitness", kind: "challenge",
    stake: 4000, judge: "sam", created: -3, closes: 4, resolves: 30, opponent: "ben", opponentTask: "50 unbroken push-ups",
    positions: [
      { who: "alex", conf: 65, task: "Run a 5K in under 25:00 (Strava proof)" },
      { who: "ben", conf: 70, task: "50 unbroken push-ups, chest to fist" },
    ],
  });
  await makeBet({
    group: chat, creator: "priya", title: "Will FERN trade above $45 by the end of Q1?", category: "markets", kind: "binary",
    stake: 2000, custom: true, isPublic: true, judge: "claude", created: -2, closes: 12, resolves: 130,
    criteria: "Any official closing price above $45.00 on or before March 31.",
    positions: [
      { who: "priya", opt: 0, amt: 3000, conf: 60 },
      { who: "alex", opt: 1, amt: 2000, conf: 65 },
      { who: "claude", opt: 1, conf: 58, note: "(Demo data) Needs a ~30% run from here; possible, but base rates for that in one quarter are low." },
    ],
  });
  await makeBet({
    group: chat, creator: "jo", title: "Which wins Best Picture?", category: "culture", kind: "multi",
    options: ["The Long Field", "Blue Hour", "Copperhead", "Paper Moons", "Something else"], money: false, isPublic: true, judge: "creator",
    created: -1, closes: 60, resolves: 100,
    positions: [
      { who: "jo", opt: 3, conf: 35 },
      { who: "maya", opt: 1, conf: 40 },
      { who: "sam", opt: 0, conf: 30 },
    ],
  });
  await makeBet({
    group: chat, creator: "maya", title: "Will Jo actually move to Lisbon by June?", category: "life", kind: "binary",
    stake: 3000, subject: "jo", judge: "priya", created: -10, closes: 20, resolves: 200,
    criteria: "Signed lease + one-way ticket. Visiting doesn't count.",
    positions: [
      { who: "jo", opt: 0, conf: 75, note: "Already looking at apartments in Alfama." },
      { who: "maya", opt: 1, conf: 60 },
      { who: "ben", opt: 1, conf: 55 },
    ],
  });
  // Awaiting a call from Alex (judge)
  await makeBet({
    group: chat, creator: "priya", title: "Will Priya finish the 12-week marathon training block?", category: "fitness", kind: "binary",
    stake: 1500, subject: "priya", judge: "alex", created: -90, closes: -80, resolves: -1,
    positions: [
      { who: "priya", opt: 0, conf: 80 },
      { who: "ben", opt: 1, conf: 55 },
      { who: "jo", opt: 0, conf: 65 },
    ],
  });
  // Under review — Alex needs to confirm or dispute
  await makeBet({
    group: chat, creator: "maya", title: "Will Maya's sourdough starter survive the month?", category: "life", kind: "binary",
    money: false, judge: "creator", created: -33, closes: -28, resolves: -0.5,
    positions: [
      { who: "maya", opt: 0, conf: 70 },
      { who: "alex", opt: 1, conf: 75 },
      { who: "sam", opt: 0, conf: 50 },
    ],
    outcome: { opt: 0 },
    state: "proposed",
    talk: [{ who: "maya", body: "It's thriving. Named it Gerald.", ago: 6 }],
  });
  // Disputed — vote in progress
  await makeBet({
    group: chat, creator: "ben", title: "Will Sam go a full week without mentioning crypto?", category: "life", kind: "binary",
    stake: 1000, subject: "sam", judge: "creator", created: -12, closes: -9, resolves: -2,
    positions: [
      { who: "sam", opt: 0, conf: 60 },
      { who: "ben", opt: 1, conf: 85 },
      { who: "alex", opt: 1, conf: 80 },
      { who: "jo", opt: 0, conf: 50 },
    ],
    outcome: { opt: 1 },
    state: "disputed",
    reviews: [
      { who: "sam", kind: "dispute", reason: "Saying 'blockchain' in a work meeting does not count." },
      { who: "alex", kind: "confirm" },
    ],
  });

  // A pending payment Alex needs to confirm
  await db.insert(payments).values({
    id: newId(),
    groupId: chat,
    fromId: people.jo.id,
    toId: people.alex.id,
    amountCents: 500,
    status: "pending",
    createdById: people.jo.id,
    note: "Infinite Jest money",
    createdAt: at(-1),
  });

  console.log("✓ seeded demo data. Sign in locally as any of:", Object.values(people).map((p) => p.id).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.close());

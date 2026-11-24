"use server";

import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { betOptions, bets, comments, groupMembers, positions, reviews, type Outcome } from "../db/schema";
import { newId } from "../ids";
import { isCategory } from "../categories";
import {
  CLAUDE_ID,
  DAY,
  canCancel,
  canPropose,
  canReview,
  canTakePosition,
  judgeOf,
  subjectMayPick,
  validateOutcome,
} from "../engine/rules";
import { logActivity } from "../data/activity";
import { advanceBet, openDispute, proposeOutcome } from "../server/lifecycle";
import { claudeEnabled } from "../claude/agent";
import { runClaudePredict, runClaudeResolve } from "../claude/jobs";
import { withNotifications } from "../notify";
import { noticeChallenge } from "../notify/events";
import { actionMember, actionUser, fail, run } from "./result";

const MIN_STAKE = 100; // $1
const MAX_STAKE = 1_000_000; // $10,000

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (max ${max} characters).`)
    .transform((s) => (s.length ? s : null))
    .nullable()
    .optional();

const CreateBet = z
  .object({
    groupId: z.string().min(1),
    kind: z.enum(["binary", "multi", "challenge"]),
    title: z.string().trim().min(5, "Write the question (5+ characters).").max(140, "Keep the question under 140 characters."),
    description: text(1000, "Details"),
    criteria: text(500, "Resolution criteria"),
    category: z.string().refine(isCategory, "Pick a category."),
    isPublic: z.boolean(),
    options: z.array(z.string().trim().min(1, "Options can't be blank.").max(60, "Keep options under 60 characters.")).max(8),
    stakeMode: z.enum(["money", "bragging"]),
    stakeCents: z.number().int().min(0).max(MAX_STAKE),
    customStakes: z.boolean(),
    subjectId: z.string().nullable(),
    closesAt: z.number().int(),
    resolvesAt: z.number().int(),
    judgeMode: z.enum(["creator", "person", "claude"]),
    judgeId: z.string().nullable(),
    opponentId: z.string().nullable(),
    opponentTask: text(200, "Their task"),
    mine: z
      .object({
        optionIndex: z.number().int().min(0).max(7).nullable(),
        amountCents: z.number().int().min(0).max(MAX_STAKE),
        confidence: z.number().int().min(1).max(99),
        note: text(280, "Your note"),
        task: text(200, "Your task"),
      })
      .nullable(),
  })
  .strict();

export type CreateBetInput = z.input<typeof CreateBet>;

export async function createBet(input: CreateBetInput) {
  const res = await run(async () => {
    const b = CreateBet.parse(input);
    const { user } = await actionMember(b.groupId);
    const now = Date.now();

    // Timing
    if (b.closesAt < now + 5 * 60 * 1000) fail("Betting should stay open for at least 5 minutes.");
    if (b.resolvesAt < b.closesAt) fail("The result date can't be before betting closes.");
    if (b.resolvesAt > now + 5 * 365 * DAY) fail("Keep it within five years.");

    // Options
    let options: string[];
    if (b.kind === "binary") options = ["Yes", "No"];
    else if (b.kind === "multi") {
      options = b.options;
      if (options.length < 2) fail("Add at least two options.");
      const lowered = options.map((o) => o.toLowerCase());
      if (new Set(lowered).size !== lowered.length) fail("Options must be different from each other.");
    } else options = [];

    // People must be in the group (and human)
    const members = new Set(
      (await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, b.groupId))).map((m) => m.userId),
    );
    for (const id of [b.subjectId, b.judgeId, b.opponentId]) {
      if (id && (!members.has(id) || id === CLAUDE_ID)) fail("Everyone you tag must be in this group.");
    }

    const isPublic = b.kind === "challenge" ? false : b.isPublic;
    const subjectId = b.kind === "challenge" ? null : b.subjectId;

    // Judging
    if (b.judgeMode === "claude") {
      if (!isPublic) fail("Claude can only judge bets about public events.");
      if (!claudeEnabled()) fail("Claude isn't set up on this server yet — pick a human judge.");
    }
    if (b.judgeMode === "person") {
      if (!b.judgeId) fail("Choose who will judge this bet.");
      if (b.judgeId === user.id) fail("You're the creator — choose “Me” as judge instead.");
    }
    const judgeId = b.judgeMode === "person" ? b.judgeId : null;
    if (subjectId && (judgeId === subjectId || (b.judgeMode === "creator" && subjectId === user.id))) {
      fail("The person the bet is about can't also judge it.");
    }
    if (b.kind === "challenge" && b.opponentId && b.opponentId === judgeId) fail("Your opponent can't also be the judge.");
    if (b.kind === "challenge" && b.opponentId === user.id) fail("You can't challenge yourself.");

    // Stakes
    const money = b.stakeMode === "money";
    const stakeCents = money ? b.stakeCents : 0;
    if (money && stakeCents < MIN_STAKE) fail("Minimum stake is $1.");
    const customStakes = money && b.kind !== "challenge" ? b.customStakes : false;

    // Creator's own position
    if (b.kind === "challenge" && !b.mine?.task) fail("Describe your side of the challenge.");
    let myPosition: typeof positions.$inferInsert | null = null;
    const betId = newId();
    const optionRows = options.map((label, i) => ({ id: newId(), betId, label, sortOrder: i }));
    if (b.mine) {
      if (b.judgeMode === "person" && judgeId === user.id) fail("Judges can't bet.");
      let optionId: string | null = null;
      if (b.kind !== "challenge") {
        if (b.mine.optionIndex === null || !optionRows[b.mine.optionIndex]) fail("Pick a side.");
        optionId = optionRows[b.mine.optionIndex].id;
        if (b.kind === "binary" && subjectId === user.id && b.mine.optionIndex !== 0) {
          fail("You can't bet against yourself.");
        }
      }
      const amount = !money ? 0 : customStakes ? b.mine.amountCents : stakeCents;
      if (money && (amount < MIN_STAKE || amount > MAX_STAKE)) fail("Stake must be between $1 and $10,000.");
      myPosition = {
        id: newId(),
        betId,
        userId: user.id,
        optionId,
        amountCents: amount,
        confidence: b.mine.confidence,
        note: b.mine.note ?? null,
        task: b.kind === "challenge" ? (b.mine.task ?? null) : null,
      };
    }

    const wantsClaude = isPublic && claudeEnabled();
    await db.batch([
      db.insert(bets).values({
        id: betId,
        groupId: b.groupId,
        creatorId: user.id,
        title: b.title,
        description: b.description ?? null,
        criteria: b.criteria ?? null,
        category: b.category,
        kind: b.kind,
        stakeMode: b.stakeMode,
        stakeCents,
        customStakes,
        isPublic,
        subjectId,
        challengeOpponentId: b.kind === "challenge" ? b.opponentId : null,
        challengeOpponentTask: b.kind === "challenge" ? (b.opponentTask ?? null) : null,
        closesAt: new Date(b.closesAt),
        resolvesAt: new Date(b.resolvesAt),
        judgeMode: b.judgeMode,
        judgeId,
        claudePredict: wantsClaude ? "pending" : "none",
      }),
      ...(optionRows.length ? [db.insert(betOptions).values(optionRows)] : []),
      ...(myPosition ? [db.insert(positions).values(myPosition)] : []),
    ]);
    await logActivity({ groupId: b.groupId, betId, actorId: user.id, type: "bet_created" });
    if (b.kind === "challenge" && b.opponentId) await withNotifications(user.id, async () => noticeChallenge(betId));
    if (wantsClaude) after(() => runClaudePredict(betId));
    return betId;
  });
  if (res.ok) redirect(`/bets/${res.data}?new=1`);
  return res;
}

async function loadBetForMember(betId: string) {
  const bet = await db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!bet) fail("That bet doesn't exist.");
  const { user } = await actionMember(bet.groupId);
  return { bet, user };
}

const TakePosition = z.object({
  optionId: z.string().nullable(),
  amountCents: z.number().int().min(0).max(MAX_STAKE),
  confidence: z.number().int().min(1).max(99),
  note: text(280, "Your note"),
  task: text(200, "Your task"),
});

export async function takePosition(betId: string, input: z.input<typeof TakePosition>) {
  return run(async () => {
    const p = TakePosition.parse(input);
    const { bet, user } = await loadBetForMember(betId);
    const check = canTakePosition(bet, user.id, Date.now());
    if (!check.ok) fail(check.reason);

    let optionId: string | null = null;
    if (bet.kind !== "challenge") {
      const opts = await db.select().from(betOptions).where(eq(betOptions.betId, betId)).orderBy(betOptions.sortOrder);
      const idx = opts.findIndex((o) => o.id === p.optionId);
      if (idx < 0) fail("Pick a side.");
      const sub = subjectMayPick(bet, user.id, idx);
      if (!sub.ok) fail(sub.reason);
      optionId = opts[idx].id;
    } else if (!p.task) {
      fail("Describe what you're committing to.");
    }

    const money = bet.stakeMode === "money";
    const amount = !money ? 0 : bet.customStakes ? p.amountCents : bet.stakeCents;
    if (money && (amount < MIN_STAKE || amount > MAX_STAKE)) fail("Stake must be between $1 and $10,000.");

    const existing = await db
      .select({ id: positions.id })
      .from(positions)
      .where(and(eq(positions.betId, betId), eq(positions.userId, user.id)))
      .get();
    const values = {
      optionId,
      amountCents: amount,
      confidence: p.confidence,
      note: p.note ?? null,
      task: bet.kind === "challenge" ? (p.task ?? null) : null,
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(positions).set(values).where(eq(positions.id, existing.id));
    } else {
      await db.insert(positions).values({ id: newId(), betId, userId: user.id, ...values });
      await logActivity({
        groupId: bet.groupId,
        betId,
        actorId: user.id,
        type: bet.kind === "challenge" ? "challenge_accepted" : "position_taken",
      });
    }
    refresh();
  });
}

export async function withdrawPosition(betId: string) {
  return run(async () => {
    const { bet, user } = await loadBetForMember(betId);
    if (bet.status !== "open" || Date.now() >= bet.closesAt.getTime()) fail("Betting has closed — positions are locked.");
    await db.delete(positions).where(and(eq(positions.betId, betId), eq(positions.userId, user.id)));
    refresh();
  });
}

export async function cancelBet(betId: string) {
  return run(async () => {
    const { bet, user } = await loadBetForMember(betId);
    const ps = await db.select({ userId: positions.userId }).from(positions).where(eq(positions.betId, betId));
    const check = canCancel(bet, ps, user.id);
    if (!check.ok) fail(check.reason);
    const now = new Date();
    await db
      .update(bets)
      .set({ status: "cancelled", settledVia: "cancelled", settledAt: now, updatedAt: now })
      .where(and(eq(bets.id, betId), eq(bets.status, "open")));
    await logActivity({ groupId: bet.groupId, betId, actorId: user.id, type: "cancelled" });
    refresh();
  });
}

const OutcomeSchema: z.ZodType<Outcome> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("option"), optionId: z.string() }),
  z.object({ type: z.literal("challenge"), results: z.record(z.string(), z.enum(["pass", "fail"])) }),
  z.object({ type: z.literal("void") }),
]);

export async function callBet(betId: string, input: { outcome: Outcome; note: string | null }) {
  return run(async () => {
    const outcome = OutcomeSchema.parse(input.outcome);
    const note = text(1000, "Note").parse(input.note) ?? null;
    const { bet, user } = await loadBetForMember(betId);
    const [opts, ps] = await Promise.all([
      db.select({ id: betOptions.id }).from(betOptions).where(eq(betOptions.betId, betId)),
      db.select({ id: positions.id, userId: positions.userId }).from(positions).where(eq(positions.betId, betId)),
    ]);
    const check = canPropose(bet, user.id, Date.now(), ps.length);
    if (!check.ok) fail(check.reason);
    const valid = validateOutcome(bet.kind, outcome, opts.map((o) => o.id), ps.map((p) => p.id));
    if (!valid.ok) fail(valid.reason);
    const ok = await withNotifications(user.id, () => proposeOutcome(betId, user.id, outcome, note));
    if (!ok) fail("This bet changed while you were deciding. Refresh and try again.");
    refresh();
  });
}

export async function reviewCall(betId: string, input: { verdict: "confirm" | "dispute"; reason: string | null }) {
  return run(async () => {
    const verdict = z.enum(["confirm", "dispute"]).parse(input.verdict);
    const reason = text(500, "Reason").parse(input.reason) ?? null;
    if (verdict === "dispute" && !reason) fail("Say briefly why you're disputing.");
    const { bet, user } = await loadBetForMember(betId);
    const [ps, rs] = await Promise.all([
      db.select({ userId: positions.userId }).from(positions).where(eq(positions.betId, betId)),
      db.select().from(reviews).where(eq(reviews.betId, betId)),
    ]);
    const check = canReview(bet, ps, rs, user.id);
    if (!check.ok) fail(check.reason);
    await withNotifications(user.id, async () => {
      await db
        .insert(reviews)
        .values({
          id: newId(),
          betId,
          userId: user.id,
          proposalVersion: bet.proposalVersion,
          kind: verdict,
          vote: verdict === "confirm" ? "uphold" : "void",
          reason,
        })
        .onConflictDoNothing();
      if (verdict === "dispute" && bet.status === "proposed") await openDispute(betId, user.id);
      await advanceBet(betId);
    });
    refresh();
  });
}

export async function askClaudeToCall(betId: string) {
  return run(async () => {
    const { bet, user } = await loadBetForMember(betId);
    if (bet.judgeMode !== "claude") fail("Claude isn't the judge on this bet.");
    const isParticipant = await db
      .select({ id: positions.id })
      .from(positions)
      .where(and(eq(positions.betId, betId), eq(positions.userId, user.id)))
      .get();
    if (!isParticipant && user.id !== bet.creatorId) fail("Only participants can nudge Claude.");
    if (bet.claudeResolve === "running") fail("Claude is already researching this one.");
    after(() => runClaudeResolve(betId, { force: true }));
    await db.update(bets).set({ claudeResolve: bet.claudeResolve === "none" ? "pending" : bet.claudeResolve }).where(eq(bets.id, betId));
    refresh();
  });
}

export async function addComment(betId: string, body: string) {
  return run(async () => {
    const clean = z.string().trim().min(1, "Say something first.").max(500, "Keep it under 500 characters.").parse(body);
    const { user } = await loadBetForMember(betId);
    await db.insert(comments).values({ id: newId(), betId, userId: user.id, body: clean });
    refresh();
  });
}

export async function deleteComment(commentId: string) {
  return run(async () => {
    const user = await actionUser();
    const c = await db.select().from(comments).where(eq(comments.id, commentId)).get();
    if (!c || c.userId !== user.id) fail("You can only delete your own comments.");
    await db.delete(comments).where(eq(comments.id, commentId));
    refresh();
  });
}

/**
 * Fix a bet's category (Life, Markets, Fitness…). It only labels the bet and sorts
 * it in stats, never changes terms or payouts, so any group member may correct it.
 */
export async function setBetCategory(betId: string, category: string) {
  return run(async () => {
    if (typeof category !== "string" || !isCategory(category)) fail("Pick a category from the list.");
    await loadBetForMember(betId);
    await db.update(bets).set({ category }).where(eq(bets.id, betId));
    refresh();
  });
}

/**
 * Hand judging to someone with no stake: Claude (public events only) or a group
 * member who isn't betting and isn't the bet's subject. Only the creator can do
 * it, only while betting is open, and only away from a judge who has a stake,
 * so it can make a bet more trustworthy but never less.
 */
export async function makeJudgeNeutral(betId: string, to: { mode: "claude" } | { mode: "person"; judgeId: string }) {
  return run(async () => {
    const { bet, user } = await loadBetForMember(betId);
    if (bet.creatorId !== user.id) fail("Only the creator can change the judge.");
    if (bet.status !== "open") fail("The judge can only change while betting is open.");
    const ps = await db.select({ userId: positions.userId }).from(positions).where(eq(positions.betId, betId));
    const betting = new Set(ps.map((p) => p.userId));
    if (!betting.has(judgeOf(bet))) fail("The judge is already neutral.");
    if (to.mode === "claude") {
      if (!bet.isPublic || !claudeEnabled()) fail("Claude can only judge public events.");
      await db.update(bets).set({ judgeMode: "claude", judgeId: null, updatedAt: new Date() }).where(and(eq(bets.id, betId), eq(bets.status, "open")));
    } else {
      const judgeId = z.string().max(40).parse(to.judgeId);
      if (betting.has(judgeId)) fail("They're betting on it, so they can't judge it.");
      if (judgeId === bet.subjectId) fail("The person it's about can't judge it.");
      const member = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, bet.groupId), eq(groupMembers.userId, judgeId)))
        .get();
      if (!member) fail("They're not in this group.");
      await db.update(bets).set({ judgeMode: "person", judgeId, updatedAt: new Date() }).where(and(eq(bets.id, betId), eq(bets.status, "open")));
    }
    refresh();
  });
}

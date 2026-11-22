import "server-only";
import { and, count, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import { bets, claudeRuns, positions, type Bet } from "../db/schema";
import { newId } from "../ids";
import { CLAUDE_ID } from "../engine/rules";
import { categoryOf } from "../categories";
import { logActivity } from "../data/activity";
import { claudeWorkDue, optionsFor, proposeOutcome } from "../server/lifecycle";
import { claudeEnabled, predictBet, resolveBet, type BetBrief, type Usage } from "./agent";
import { withNotifications } from "../notify";
import { sweepTimedNotices } from "../notify/events";

const MAX_PREDICT_ATTEMPTS = 3;
const MAX_RESOLVE_ATTEMPTS = 8; // ~2 days of 6-hourly "not yet" checks before humans take over
const DAILY_LIMIT = Number(process.env.CLAUDE_DAILY_LIMIT_PER_GROUP ?? 40);

async function underDailyLimit(groupId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ n: count() })
    .from(claudeRuns)
    .where(and(eq(claudeRuns.groupId, groupId), gte(claudeRuns.createdAt, since)));
  return (row?.n ?? 0) < DAILY_LIMIT;
}

async function recordRun(bet: Bet, kind: "predict" | "resolve", ok: boolean, usage: Usage | null, error?: string) {
  await db.insert(claudeRuns).values({
    id: newId(),
    betId: bet.id,
    groupId: bet.groupId,
    kind,
    ok,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    searches: usage?.searches ?? 0,
    error: error?.slice(0, 500) ?? null,
  });
}

async function brief(bet: Bet): Promise<BetBrief> {
  const options = await optionsFor(bet.id);
  return {
    title: bet.title,
    description: bet.description,
    criteria: bet.criteria,
    category: categoryOf(bet.category).label,
    closesAt: bet.closesAt,
    resolvesAt: bet.resolvesAt,
    options: options.map((o) => ({ id: o.id, label: o.label })),
  };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Claim the job atomically so concurrent triggers can't double-run (and double-bill). */
async function claim(betId: string, job: "predict" | "resolve") {
  const now = new Date();
  const stale = new Date(now.getTime() - 10 * 60 * 1000);
  const col = job === "predict" ? bets.claudePredict : bets.claudeResolve;
  const claimed = await db
    .update(bets)
    .set({
      [job === "predict" ? "claudePredict" : "claudeResolve"]: "running",
      claudeAttempts: sql`${bets.claudeAttempts} + 1`,
      claudeLastAttemptAt: now,
    })
    .where(
      and(
        eq(bets.id, betId),
        eq(bets.status, "open"),
        or(
          inArray(col, job === "predict" ? ["pending"] : ["none", "pending"]),
          and(eq(col, "running"), or(isNull(bets.claudeLastAttemptAt), lte(bets.claudeLastAttemptAt, stale))),
        ),
      ),
    )
    .returning();
  return claimed[0] ?? null;
}

export async function runClaudePredict(betId: string) {
  if (!claudeEnabled()) return;
  const bet = await claim(betId, "predict");
  if (!bet) return;
  if (!(await underDailyLimit(bet.groupId))) {
    await db.update(bets).set({ claudePredict: "pending" }).where(eq(bets.id, betId));
    return;
  }
  try {
    const result = await predictBet(await brief(bet));
    await recordRun(bet, "predict", true, result.usage);
    // Never let Claude pick after betting closes — it would have an information edge.
    const fresh = await db.select().from(bets).where(eq(bets.id, betId)).get();
    if (!fresh || fresh.status !== "open" || Date.now() >= fresh.closesAt.getTime()) {
      await db.update(bets).set({ claudePredict: "failed", claudeNote: "Betting closed before Claude finished researching." }).where(eq(bets.id, betId));
      return;
    }
    await db
      .insert(positions)
      .values({
        id: newId(),
        betId,
        userId: CLAUDE_ID,
        optionId: result.optionId,
        amountCents: 0,
        confidence: result.probability,
        note: result.reasoning,
        sources: result.sources,
      })
      .onConflictDoNothing();
    await db.update(bets).set({ claudePredict: "done", claudeAttempts: 0 }).where(eq(bets.id, betId));
    await logActivity({ groupId: bet.groupId, betId, actorId: CLAUDE_ID, type: "claude_predicted" });
  } catch (e) {
    console.error("Claude predict failed", betId, e);
    await recordRun(bet, "predict", false, null, errMsg(e));
    await db
      .update(bets)
      .set({ claudePredict: bet.claudeAttempts >= MAX_PREDICT_ATTEMPTS ? "failed" : "pending" })
      .where(eq(bets.id, betId));
  }
}

/** Claude researches a due bet and, if it can, makes the call (which notifies reviewers). */
export function runClaudeResolve(betId: string, opts: { force?: boolean } = {}) {
  return withNotifications(CLAUDE_ID, () => resolveInner(betId, opts));
}

async function resolveInner(betId: string, { force = false }: { force?: boolean }) {
  if (!claudeEnabled()) return { ok: false as const, reason: "Claude isn't configured on this server." };
  const pre = await db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!pre || pre.judgeMode !== "claude" || pre.status !== "open") return { ok: false as const, reason: "Nothing to resolve." };
  if (Date.now() < pre.resolvesAt.getTime() && !force) return { ok: false as const, reason: "Not due yet." };
  if (force && pre.claudeResolve === "pending") {
    // A human nudge skips the 6-hour backoff, but not the claim.
    await db.update(bets).set({ claudeLastAttemptAt: null }).where(eq(bets.id, betId));
  }
  const bet = await claim(betId, "resolve");
  if (!bet) return { ok: false as const, reason: "Claude is already on it." };
  if (!(await underDailyLimit(bet.groupId))) {
    await db.update(bets).set({ claudeResolve: "pending" }).where(eq(bets.id, betId));
    return { ok: false as const, reason: "Claude has hit today's limit for this group." };
  }
  try {
    const r = await resolveBet(await brief(bet));
    await recordRun(bet, "resolve", true, r.usage);
    const note = formatNote(r.explanation, r.sources);
    if (r.verdict === "not_yet") {
      const giveUp = bet.claudeAttempts >= MAX_RESOLVE_ATTEMPTS;
      await db
        .update(bets)
        .set({ claudeResolve: giveUp ? "failed" : "pending", claudeNote: `Not yet: ${note}` })
        .where(eq(bets.id, betId));
      if (giveUp) sweepTimedNotices([bet.groupId]); // the creator can call it now
      return { ok: true as const, verdict: "not_yet" as const };
    }
    await db.update(bets).set({ claudeResolve: "done", claudeNote: note }).where(eq(bets.id, betId));
    await proposeOutcome(betId, CLAUDE_ID, r.verdict === "void" ? { type: "void" } : { type: "option", optionId: r.optionId }, note);
    return { ok: true as const, verdict: r.verdict };
  } catch (e) {
    console.error("Claude resolve failed", betId, e);
    await recordRun(bet, "resolve", false, null, errMsg(e));
    const giveUp = bet.claudeAttempts >= MAX_RESOLVE_ATTEMPTS;
    await db
      .update(bets)
      .set({ claudeResolve: giveUp ? "failed" : "pending" })
      .where(eq(bets.id, betId));
    if (giveUp) sweepTimedNotices([bet.groupId]);
    return { ok: false as const, reason: "Claude couldn't reach a verdict. It'll retry later." };
  }
}

function formatNote(explanation: string, sources: { title: string; url: string }[]) {
  if (sources.length === 0) return explanation;
  return `${explanation}\n\nSources:\n${sources.map((s) => `- ${s.title} — ${s.url}`).join("\n")}`;
}

/** Run whatever Claude work is due (bounded). Call from `after()` or the cron. */
export async function runDueClaudeWork(groupIds?: string[]) {
  if (!claudeEnabled()) return { predicted: 0, resolved: 0 };
  const due = await claudeWorkDue(groupIds);
  // One batch for the whole run, so several verdicts reach each person as one push.
  await withNotifications(CLAUDE_ID, () =>
    Promise.allSettled([...due.predict.map((id) => runClaudePredict(id)), ...due.resolve.map((id) => runClaudeResolve(id))]),
  );
  return { predicted: due.predict.length, resolved: due.resolve.length };
}

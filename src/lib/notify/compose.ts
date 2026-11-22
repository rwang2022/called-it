/**
 * Pure notification logic: what each event says, and how a batch of notices
 * collapses into at most one push per person. No I/O, so it's unit-tested.
 */
import { REVIEW_WINDOW_MS, VOTE_WINDOW_MS, HOUR } from "../engine/rules";
import { firstName, money } from "../format";
import { APP_NAME } from "../brand";

export type PushPayload = {
  title: string;
  body: string;
  /** Same-origin path opened when the notification is tapped. */
  url: string;
  /** Notifications sharing a tag replace each other on the device. */
  tag?: string;
};

export type NoticeKind = "settled" | "vote" | "review" | "judge" | "challenge" | "payment" | "reveal";

/**
 * When one action produces several notices about the same thing for the same
 * person, the most consequential wins: a settlement makes the vote that caused
 * it moot, and anything you must act on beats an FYI.
 */
const PRIORITY: Record<NoticeKind, number> = {
  settled: 7,
  vote: 6,
  review: 5,
  judge: 4,
  challenge: 3,
  payment: 2,
  reveal: 1,
};

const ACTIONABLE = new Set<NoticeKind>(["vote", "review", "judge", "challenge", "payment"]);

export type Notice = {
  userId: string;
  /** Recipients must still be in this group when the push goes out. */
  groupId: string;
  kind: NoticeKind;
  /** What it's about (a bet or payment id). Notices about the same subject collapse. */
  subject: string;
  /** Whoever caused it. They never get notified about their own action. */
  actorId?: string | null;
  payload: PushPayload;
};

/** Pick one payload per recipient. `isMember(groupId, userId)` enforces group membership. */
export function planDeliveries(notices: Notice[], isMember: (groupId: string, userId: string) => boolean) {
  const byUser = new Map<string, Notice[]>();
  for (const n of notices) {
    if (n.actorId && n.userId === n.actorId) continue;
    if (!isMember(n.groupId, n.userId)) continue;
    const list = byUser.get(n.userId) ?? [];
    list.push(n);
    byUser.set(n.userId, list);
  }
  const plan = new Map<string, PushPayload>();
  for (const [userId, list] of byUser) plan.set(userId, mergeForUser(list));
  return plan;
}

function mergeForUser(list: Notice[]): PushPayload {
  // Best notice per subject; later notices win ties.
  const best = new Map<string, Notice>();
  for (const n of list) {
    const cur = best.get(n.subject);
    if (!cur || PRIORITY[n.kind] >= PRIORITY[cur.kind]) best.set(n.subject, n);
  }
  const picks = [...best.values()].sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind]);
  if (picks.length === 1) return picks[0].payload;
  return {
    title: `${picks.length} updates in ${APP_NAME}`,
    body: clip(picks.map((p) => p.payload.title).join(" · "), 180),
    url: picks.some((p) => ACTIONABLE.has(p.kind)) ? "/inbox" : "/home",
    tag: "digest",
  };
}

export function clip(s: string, max: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

const q = (title: string) => `“${clip(title, 70)}”`;
const hours = (ms: number) => `${Math.round(ms / HOUR)}h`;
const who = (name: string, isBot = false) => (isBot ? "Claude" : firstName(name));

type BetRef = { id: string; title: string };
const betUrl = (b: BetRef) => `/bets/${b.id}`;
const betTag = (b: BetRef) => `bet-${b.id}`;

export const copy = {
  judgeDue(bet: BetRef): PushPayload {
    return { title: "Time to make the call", body: `${q(bet.title)} is due, and you're the judge.`, url: betUrl(bet), tag: betTag(bet) };
  },

  claudeFallback(bet: BetRef): PushPayload {
    return { title: "Claude couldn't call it", body: `You can call ${q(bet.title)} yourself now.`, url: betUrl(bet), tag: betTag(bet) };
  },

  callMade(bet: BetRef, caller: { name: string; isBot: boolean }, outcome: string | null): PushPayload {
    const name = who(caller.name, caller.isBot);
    const title = outcome === "void" ? `${name} called it off` : outcome ? `${name} called it: ${clip(outcome, 40)}` : `${name} made the call`;
    return { title, body: `Confirm or dispute the call on ${q(bet.title)} within ${hours(REVIEW_WINDOW_MS)}.`, url: betUrl(bet), tag: betTag(bet) };
  },

  disputeOpened(bet: BetRef, disputer: { name: string }): PushPayload {
    return {
      title: "Vote on a disputed call",
      body: `${firstName(disputer.name)} disputed the call. Voting on ${q(bet.title)} closes in ${hours(VOTE_WINDOW_MS)}.`,
      url: betUrl(bet),
      tag: betTag(bet),
    };
  },

  challenged(bet: BetRef, challenger: { name: string }, task: string | null): PushPayload {
    return {
      title: `${firstName(challenger.name)} challenged you`,
      body: `Accept ${q(bet.title)} before betting closes.${task ? ` Your part: ${clip(task, 60)}.` : ""}`,
      url: betUrl(bet),
      tag: betTag(bet),
    };
  },

  paymentClaimed(p: { id: string; groupId: string; amountCents: number }, from: { name: string }, groupName: string): PushPayload {
    return {
      title: `${firstName(from.name)} says they paid you ${money(p.amountCents)}`,
      body: `Confirm it in ${clip(groupName, 40)}'s ledger so balances stay right.`,
      url: `/g/${p.groupId}/ledger`,
      tag: `pay-${p.id}`,
    };
  },

  settled(
    bet: BetRef & { money: boolean },
    result: { result: "win" | "loss" | "push"; netCents: number },
    outcome: string | null,
  ): PushPayload {
    const base = { url: betUrl(bet), tag: betTag(bet) };
    if (outcome === "void") {
      return { ...base, title: "Bet voided", body: `${q(bet.title)} was voided. Nobody owes anything on it.` };
    }
    const how = outcome ? ` Result: ${clip(outcome, 40)}.` : "";
    const body = `${q(bet.title)} has settled.${how}`;
    if (bet.money && result.netCents > 0) return { ...base, title: `You won ${money(result.netCents)}`, body };
    if (bet.money && result.netCents < 0) return { ...base, title: `You lost ${money(-result.netCents)}`, body };
    if (result.result === "win") return { ...base, title: "You called it", body };
    if (result.result === "loss") return { ...base, title: "Not this time", body };
    return { ...base, title: "It's a wash", body: `${body} No money changes hands.` };
  },

  claudeRevealed(bet: BetRef, pick: string, confidence: number): PushPayload {
    return {
      title: "Claude's pick is out",
      body: `Betting has closed. Claude picked ${clip(pick, 40)} at ${confidence}% on ${q(bet.title)}`,
      url: betUrl(bet),
      tag: betTag(bet),
    };
  },

  test(): PushPayload {
    return { title: "Notifications are on", body: `This is what a ${APP_NAME} alert looks like.`, url: "/inbox", tag: "test" };
  },
};

import "server-only";
import { cache } from "react";
import { count, eq } from "drizzle-orm";
import { db } from "../db";
import { groupMembers, groups, bets } from "../db/schema";
import { phaseOf } from "../engine/rules";
import { shortDuration } from "../format";

/**
 * What a shared link may reveal to someone who isn't signed in (and to the link
 * previews Discord, iMessage and friends build): the question, the group's name
 * and where the bet stands. Never names, picks, stakes, comments or Claude's
 * sealed pick: those stay behind sign-in and group membership.
 */
export type BetTeaser = {
  id: string;
  title: string;
  groupName: string;
  groupHue: number;
  /** One line for text previews: "Open · closes in 2d 4h". */
  status: string;
  /** The same, split for the card: a word ("Open") and what it means right now. */
  label: string;
  detail: string;
  tone: "live" | "settled" | "quiet";
  /** True while people can still take a side. */
  open: boolean;
};

const ID = /^[0-9a-z]{6,40}$/;

export const betTeaser = cache(async (betId: string): Promise<BetTeaser | null> => {
  if (!ID.test(betId)) return null;
  const row = await db
    .select({ bet: bets, groupName: groups.name, groupHue: groups.hue })
    .from(bets)
    .innerJoin(groups, eq(groups.id, bets.groupId))
    .where(eq(bets.id, betId))
    .get();
  if (!row) return null;
  const b = row.bet;
  const now = Date.now();
  const phase = phaseOf(b, now);
  const [label, detail, tone]: [string, string, BetTeaser["tone"]] =
    phase === "open"
      ? ["Open", `closes in ${shortDuration(b.closesAt.getTime() - now)}`, "live"]
      : phase === "locked"
        ? ["Closed", "picks are locked in", "quiet"]
        : phase === "awaiting"
          ? ["Closed", "waiting on the call", "quiet"]
          : phase === "proposed"
            ? ["Called", "under review", "quiet"]
            : phase === "disputed"
              ? ["Disputed", "put to a vote", "quiet"]
              : phase === "settled"
                ? ["Settled", "the call stands", "settled"]
                : ["Called off", "no bet", "quiet"];
  const status = phase === "open" ? `Open · ${detail}` : label === "Closed" ? "Betting closed" : label;
  return { id: b.id, title: b.title, groupName: row.groupName, groupHue: row.groupHue, status, label, detail, tone, open: phase === "open" };
});

/** An invite link's preview: the group's name and size (the join page already shows these). */
export const inviteTeaser = cache(async (code: string) => {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,16}$/.test(clean)) return null;
  const g = await db.select({ id: groups.id, name: groups.name, hue: groups.hue }).from(groups).where(eq(groups.inviteCode, clean)).get();
  if (!g) return null;
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(groupMembers).where(eq(groupMembers.groupId, g.id));
  return { code: clean, name: g.name, hue: g.hue, members: n };
});

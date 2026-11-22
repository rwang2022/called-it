import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { bets, payments, settlements } from "../db/schema";
import { computeBalances, simplifyDebts } from "../engine/ledger";
import { CLAUDE_ID } from "../engine/rules";
import { usersById } from "./common";

export async function groupLedger(groupId: string) {
  const [setts, pays] = await Promise.all([
    db
      .select({
        userId: settlements.userId,
        netCents: settlements.netCents,
        betId: settlements.betId,
        createdAt: settlements.createdAt,
        title: bets.title,
      })
      .from(settlements)
      .innerJoin(bets, eq(bets.id, settlements.betId))
      .where(and(eq(settlements.groupId, groupId), eq(bets.stakeMode, "money"))),
    db.select().from(payments).where(eq(payments.groupId, groupId)).orderBy(desc(payments.createdAt)),
  ]);
  const confirmed = pays.filter((p) => p.status === "confirmed");
  const balances = computeBalances(
    setts.filter((s) => s.userId !== CLAUDE_ID),
    confirmed,
  );
  const transfers = simplifyDebts(balances);
  const people = await usersById([...balances.keys(), ...pays.flatMap((p) => [p.fromId, p.toId, p.createdById])]);
  const pick = (id: string) => people.get(id) ?? { id, name: "Someone", image: null, isBot: false };

  // Per-bet money movements, newest first, for the history list.
  const byBet = new Map<string, { betId: string; title: string; at: number; nets: { userId: string; netCents: number }[] }>();
  for (const s of setts) {
    if (s.netCents === 0) continue;
    const e = byBet.get(s.betId) ?? { betId: s.betId, title: s.title, at: s.createdAt.getTime(), nets: [] };
    e.nets.push({ userId: s.userId, netCents: s.netCents });
    byBet.set(s.betId, e);
  }

  return {
    balances: [...balances]
      .map(([userId, cents]) => ({ user: pick(userId), cents }))
      .sort((a, b) => b.cents - a.cents),
    transfers: transfers.map((t) => ({ from: pick(t.from), to: pick(t.to), amountCents: t.amountCents })),
    pending: pays
      .filter((p) => p.status === "pending")
      .map((p) => ({ ...p, from: pick(p.fromId), to: pick(p.toId), createdBy: pick(p.createdById), createdAt: p.createdAt.getTime() })),
    history: [
      ...pays
        .filter((p) => p.status === "confirmed")
        .map((p) => ({
          type: "payment" as const,
          id: p.id,
          at: (p.resolvedAt ?? p.createdAt).getTime(),
          from: pick(p.fromId),
          to: pick(p.toId),
          amountCents: p.amountCents,
          note: p.note,
        })),
      ...[...byBet.values()].map((e) => ({
        type: "bet" as const,
        id: e.betId,
        at: e.at,
        title: e.title,
        nets: e.nets.map((n) => ({ user: pick(n.userId), netCents: n.netCents })),
      })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 50),
  };
}

/** Payments someone says they sent you, waiting on your confirmation. */
export async function pendingPaymentsFor(userId: string) {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.status, "pending"), eq(payments.toId, userId)));
}

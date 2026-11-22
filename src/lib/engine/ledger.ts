export type Transfer = { from: string; to: string; amountCents: number };

/**
 * Net position per user: positive = the group owes them, negative = they owe.
 * A confirmed payment from A to B moves A toward zero and B toward zero.
 */
export function computeBalances(
  settlements: { userId: string; netCents: number }[],
  payments: { fromId: string; toId: string; amountCents: number }[],
): Map<string, number> {
  const bal = new Map<string, number>();
  const add = (id: string, v: number) => bal.set(id, (bal.get(id) ?? 0) + v);
  for (const s of settlements) add(s.userId, s.netCents);
  for (const p of payments) {
    add(p.fromId, p.amountCents);
    add(p.toId, -p.amountCents);
  }
  return bal;
}

/**
 * Minimise the number of payments needed to square up: repeatedly match the
 * largest debtor with the largest creditor. Produces at most n-1 transfers.
 */
export function simplifyDebts(balances: Map<string, number>): Transfer[] {
  const debtors = [...balances]
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v }))
    .sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  const creditors = [...balances]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v }))
    .sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    if (amt > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amountCents: amt });
    debtors[i].v -= amt;
    creditors[j].v -= amt;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}

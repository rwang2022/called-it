import Link from "next/link";
import { ArrowRight, HandCoins, PartyPopper } from "lucide-react";
import { groupMemberList, requireMember } from "@/lib/data/common";
import { groupLedger } from "@/lib/data/ledger";
import { viewerTimeZone } from "@/lib/tz";
import { firstName, formatDate, money, signedMoney } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { SectionHeader } from "@/components/ui/section";
import { CancelPaymentButton, RecordPaymentForm, RespondButtons, SettleButton } from "@/components/group/ledger-actions";

export const metadata = { title: "Settle up" };

export default async function LedgerPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { user } = await requireMember(groupId);
  const [ledger, members, tz] = await Promise.all([groupLedger(groupId), groupMemberList(groupId), viewerTimeZone()]);
  const mine = ledger.balances.find((b) => b.user.id === user.id)?.cents ?? 0;
  const myTransfers = ledger.transfers.filter((t) => t.from.id === user.id || t.to.id === user.id);
  const otherTransfers = ledger.transfers.filter((t) => t.from.id !== user.id && t.to.id !== user.id);
  const maxAbs = Math.max(1, ...ledger.balances.map((b) => Math.abs(b.cents)));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <section className="surface relative overflow-hidden p-6">
          <div
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full blur-3xl"
            style={{ background: mine > 0 ? "rgb(52 211 153 / .14)" : mine < 0 ? "rgb(251 113 133 / .14)" : "rgb(142 125 255 / .12)" }}
          />
          <p className="eyebrow relative">Your balance</p>
          <p className={`display relative mt-2 text-[3.6rem] leading-none ${mine > 0 ? "text-yes" : mine < 0 ? "text-no" : ""}`}>
            {mine === 0 ? "All square" : signedMoney(mine)}
          </p>
          <p className="relative mt-1 text-sm text-muted">{mine > 0 ? "The group owes you." : mine < 0 ? "You owe the group." : "Nobody owes you, and you owe nobody."}</p>
        </section>

        <SectionHeader title="Fewest payments to settle up" />
        {ledger.transfers.length === 0 ? (
          <div className="surface flex items-center gap-3 p-5 text-sm text-muted">
            <PartyPopper className="size-5 text-iris" /> Everyone is square. Go make some bets.
          </div>
        ) : (
          <ul className="surface divide-y divide-white/[0.06] overflow-hidden">
            {[...myTransfers, ...otherTransfers].map((t) => {
              const youPay = t.from.id === user.id;
              const youGet = t.to.id === user.id;
              return (
                <li key={`${t.from.id}-${t.to.id}`} className={`flex flex-wrap items-center gap-3 p-4 ${youPay || youGet ? "bg-white/[0.02]" : ""}`}>
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar user={t.from} size="sm" />
                    <span className="truncate text-sm font-medium">{youPay ? "You" : firstName(t.from.name)}</span>
                    <ArrowRight className="size-4 shrink-0 text-faint" />
                    <Avatar user={t.to} size="sm" />
                    <span className="truncate text-sm font-medium">{youGet ? "you" : firstName(t.to.name)}</span>
                  </div>
                  <span className="num text-lg font-semibold">{money(t.amountCents)}</span>
                  {youPay &&
                    (ledger.pending.some((p) => p.fromId === user.id && p.toId === t.to.id) ? (
                      <span className="chip text-gold">Awaiting their confirmation</span>
                    ) : (
                      <SettleButton groupId={groupId} counterpartyId={t.to.id} amountCents={t.amountCents} direction="paid" />
                    ))}
                  {youGet && <SettleButton groupId={groupId} counterpartyId={t.from.id} amountCents={t.amountCents} direction="received" />}
                </li>
              );
            })}
          </ul>
        )}

        {ledger.pending.length > 0 && (
          <>
            <SectionHeader title="Awaiting confirmation" count={ledger.pending.length} />
            <ul className="surface divide-y divide-white/[0.06] overflow-hidden">
              {ledger.pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                  <HandCoins className="size-5 shrink-0 text-gold" />
                  <p className="min-w-0 flex-1 text-sm">
                    <b>{p.from.id === user.id ? "You" : firstName(p.from.name)}</b> paid <b>{p.to.id === user.id ? "you" : firstName(p.to.name)}</b>{" "}
                    <span className="num">{money(p.amountCents)}</span>
                    {p.note && <span className="text-muted"> · {p.note}</span>}
                  </p>
                  {p.to.id === user.id ? (
                    <RespondButtons paymentId={p.id} />
                  ) : p.createdBy.id === user.id ? (
                    <CancelPaymentButton paymentId={p.id} />
                  ) : (
                    <span className="text-xs text-muted">Waiting on {firstName(p.to.name)}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        <SectionHeader title="History" />
        {ledger.history.length === 0 ? (
          <p className="text-sm text-faint">No money has moved yet.</p>
        ) : (
          <ul className="space-y-2">
            {ledger.history.map((h) =>
              h.type === "payment" ? (
                <li key={`p-${h.id}`} className="flex items-center gap-3 rounded-xl px-1 py-2 text-sm">
                  <span className="grid size-8 place-items-center rounded-lg bg-yes/10 text-yes">
                    <HandCoins className="size-4" />
                  </span>
                  <span className="flex-1">
                    {firstName(h.from.name)} paid {firstName(h.to.name)} <span className="num">{money(h.amountCents)}</span>
                    {h.note && <span className="text-muted"> · {h.note}</span>}
                  </span>
                  <span className="text-xs text-faint">{formatDate(h.at, tz)}</span>
                </li>
              ) : (
                <li key={`b-${h.id}`}>
                  <Link href={`/bets/${h.id}`} className="flex items-start gap-3 rounded-xl px-1 py-2 text-sm transition-colors hover:bg-white/[0.03]">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-iris/10 text-iris">$</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{h.title}</span>
                      <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                        {h.nets.map((n) => (
                          <span key={n.user.id} className={n.netCents > 0 ? "text-yes" : "text-no"}>
                            {firstName(n.user.name)} <span className="num">{signedMoney(n.netCents)}</span>
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="text-xs text-faint">{formatDate(h.at, tz)}</span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <aside className="space-y-6">
        <section className="surface p-5">
          <h2 className="eyebrow mb-4">Balances</h2>
          {ledger.balances.length === 0 ? (
            <p className="text-sm text-faint">Nothing yet.</p>
          ) : (
            <ul className="space-y-3">
              {ledger.balances.map((b) => (
                <li key={b.user.id} className="grid grid-cols-[1.75rem_1fr_4.5rem] items-center gap-2.5">
                  <Avatar user={b.user} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{b.user.id === user.id ? "You" : firstName(b.user.name)}</p>
                    <div className="mt-1 flex h-1.5">
                      <div className="flex flex-1 justify-end">
                        {b.cents < 0 && <div className="h-full rounded-l-[3px] bg-no" style={{ width: `${(Math.abs(b.cents) / maxAbs) * 100}%` }} />}
                      </div>
                      <div className="w-px bg-white/20" />
                      <div className="flex-1">
                        {b.cents > 0 && <div className="h-full rounded-r-[3px] bg-yes" style={{ width: `${(b.cents / maxAbs) * 100}%` }} />}
                      </div>
                    </div>
                  </div>
                  <span className={`num text-right text-sm ${b.cents > 0 ? "text-yes" : b.cents < 0 ? "text-no" : "text-muted"}`}>{signedMoney(b.cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="surface p-5">
          <h2 className="eyebrow mb-4">Record a payment</h2>
          <RecordPaymentForm groupId={groupId} people={members.filter((m) => m.id !== user.id && !m.isBot).map((m) => ({ id: m.id, name: m.name }))} />
          <p className="hint mt-3">Payments you send need the receiver&apos;s confirmation before they hit the books. {`Called It never moves money itself.`}</p>
        </section>
      </aside>
    </div>
  );
}

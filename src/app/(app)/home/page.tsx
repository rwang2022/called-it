import { edgePoints } from "@/lib/engine/rating";
import Link from "next/link";
import { Flame, Plus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { myGroupIds, usersById } from "@/lib/data/common";
import { attentionFor, liveBetsAcross, recentSettledAcross } from "@/lib/data/bets";
import { recentActivity } from "@/lib/data/activity";
import { pendingPaymentsFor } from "@/lib/data/ledger";
import { profileStats } from "@/lib/data/stats";
import { housekeeping } from "@/lib/server/housekeeping";
import { viewerTimeZone } from "@/lib/tz";
import { firstName, signedMoney } from "@/lib/format";
import { BetCard } from "@/components/bet/bet-card";
import { ActivityFeed } from "@/components/activity-feed";
import { AttentionList } from "@/components/attention-list";
import { EmptyState, SectionHeader } from "@/components/ui/section";
import { Scorecard } from "@/components/ui/scorecard";
import { JoinByCode } from "@/components/join-by-code";
import { requestNow } from "@/lib/now";

export const metadata = { title: "Home" };
export const maxDuration = 300;

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date()));
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Home() {
  const user = await requireUser();
  const groupIds = await myGroupIds(user.id);
  await housekeeping(groupIds);
  const now = requestNow();
  const tz = await viewerTimeZone();

  if (groupIds.length === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="display mb-2 animate-rise text-[2.8rem] leading-none">
          Welcome, <em>{firstName(user.name)}</em>
          <span className="text-gold">.</span>
        </h1>
        <p className="mb-8 text-muted">Bets live inside groups of friends. Start one, or join with an invite link.</p>
        <EmptyState
          icon={<Users className="size-6" />}
          title="Start your first group"
          action={
            <Link href="/groups/new" className="btn btn-primary">
              <Plus className="size-4" /> Create a group
            </Link>
          }
        >
          Name it, share the invite link in your group chat, and post the first bet.
        </EmptyState>
        <div className="surface mt-4 p-5">
          <p className="label">Got an invite link or code?</p>
          <JoinByCode />
        </div>
      </div>
    );
  }

  const live = await liveBetsAcross(groupIds, user.id);
  const [attention, settled, feed, pays, stats] = await Promise.all([
    attentionFor(user.id, groupIds, live),
    recentSettledAcross(groupIds, user.id, 6),
    recentActivity(groupIds, 14),
    pendingPaymentsFor(user.id),
    profileStats(user.id, groupIds),
  ]);
  const payers = await usersById(pays.map((p) => p.fromId));
  const openToJoin = live.filter((b) => b.phase === "open" && !b.mine && b.judge?.id !== user.id);
  const mine = live.filter((b) => b.mine);
  const s = stats.stats;

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <header className="mb-8 animate-rise">
          <p className="eyebrow mb-2">{greeting(tz)}</p>
          <h1 className="display text-[2.9rem] leading-none sm:text-[3.6rem]">
            {firstName(user.name)}
            <span className="text-gold">.</span>
          </h1>
          <Scorecard
            className="mt-6"
            items={[
              { label: "Record", value: s.n ? `${s.wins}–${s.losses}` : "—", sub: s.n ? "won–lost" : "no calls yet" },
              {
                label: "Net",
                value: s.stakedCents ? signedMoney(s.netCents) : "—",
                sub: s.stakedCents ? "on money bets" : "no money bets",
                tone: s.netCents > 0 ? "yes" : s.netCents < 0 ? "no" : undefined,
              },
              { label: "Edge", value: edgePoints(s.edge), sub: s.provisional ? "provisional" : "vs the room" },
              {
                label: "Streak",
                value: s.streak === 0 ? "—" : `${Math.abs(s.streak)}${s.streak > 0 ? "W" : "L"}`,
                sub: s.streak > 0 ? "in a row" : s.streak < 0 ? "cold spell" : "no streak",
                mark: s.streak >= 3 ? <Flame className="size-5 text-gold" /> : null,
              },
            ]}
          />
        </header>

        {(attention.length > 0 || pays.length > 0) && (
          <>
            <SectionHeader title="Needs you" count={attention.length + pays.length} />
            <AttentionList
              items={attention}
              payments={pays.map((p) => ({ id: p.id, amountCents: p.amountCents, fromName: payers.get(p.fromId)?.name ?? "Someone", groupId: p.groupId }))}
              now={now}
            />
          </>
        )}

        <SectionHeader title="Open for betting" count={openToJoin.length} />
        {openToJoin.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {openToJoin.slice(0, 6).map((b, i) => (
              <BetCard key={b.id} bet={b} now={now} showGroup={groupIds.length > 1} index={i} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="You're in on everything"
            action={
              <Link href="/bets/new" className="btn btn-primary">
                <Plus className="size-4" /> Post a bet
              </Link>
            }
          >
            No open bets you haven&apos;t joined. Start something.
          </EmptyState>
        )}

        {mine.length > 0 && (
          <>
            <SectionHeader title="Your live bets" count={mine.length} />
            <div className="grid gap-3 md:grid-cols-2">
              {mine.map((b, i) => (
                <BetCard key={b.id} bet={b} now={now} showGroup={groupIds.length > 1} index={i} />
              ))}
            </div>
          </>
        )}

        {settled.length > 0 && (
          <>
            <SectionHeader title="Recently settled" />
            <div className="grid gap-3 md:grid-cols-2">
              {settled.map((b, i) => (
                <BetCard key={b.id} bet={b} now={now} showGroup={groupIds.length > 1} index={i} />
              ))}
            </div>
          </>
        )}
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-10">
          <SectionHeader title="Activity" />
          <ActivityFeed rows={feed} now={now} />
        </div>
      </aside>
    </div>
  );
}


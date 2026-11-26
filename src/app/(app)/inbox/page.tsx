import { Inbox as InboxIcon } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { myGroupIds, usersById } from "@/lib/data/common";
import { attentionFor, liveBetsAcross, type BetVM } from "@/lib/data/bets";
import { pendingPaymentsFor } from "@/lib/data/ledger";
import { housekeeping } from "@/lib/server/housekeeping";
import { AttentionList } from "@/components/attention-list";
import { BetCard } from "@/components/bet/bet-card";
import { EmptyState, PageTitle, SectionHeader } from "@/components/ui/section";
import { requestNow } from "@/lib/now";

export const metadata = { title: "Inbox" };
export const maxDuration = 300;

/**
 * Open bets you could still get in on: betting's open, you haven't picked, you
 * didn't post it, and you're not its neutral judge. Challenges have their own
 * inbox item, so they're left out here.
 */
const joinable = (b: BetVM, userId: string) =>
  b.status === "open" &&
  b.phase === "open" &&
  !b.mine &&
  b.kind !== "challenge" &&
  b.creator.id !== userId &&
  !(b.judgeMode === "person" && b.viewerIsJudge);

export default async function InboxPage() {
  const user = await requireUser();
  const groupIds = await myGroupIds(user.id);
  await housekeeping(groupIds);
  const live = await liveBetsAcross(groupIds, user.id);
  const [items, pays] = await Promise.all([attentionFor(user.id, groupIds, live), pendingPaymentsFor(user.id)]);
  const payers = await usersById(pays.map((p) => p.fromId));
  const now = requestNow();
  // Newest first: the ones most likely to be news.
  const toJoin = live.filter((b) => joinable(b, user.id)).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Inbox">Calls to make, calls to review, votes, challenges and payments waiting on you, plus bets you haven&apos;t joined yet.</PageTitle>
      {items.length + pays.length === 0 ? (
        <EmptyState icon={<InboxIcon className="size-6" />} title="All caught up">
          Nothing needs you right now.{toJoin.length === 0 && " Go stir something up."}
        </EmptyState>
      ) : (
        <AttentionList
          items={items}
          payments={pays.map((p) => ({ id: p.id, amountCents: p.amountCents, fromName: payers.get(p.fromId)?.name ?? "Someone", groupId: p.groupId }))}
          now={now}
        />
      )}
      {toJoin.length > 0 && (
        <section className="mt-10">
          <SectionHeader title="Open bets you haven't joined" count={toJoin.length} />
          <div className="grid gap-3">
            {toJoin.map((b, i) => (
              <BetCard key={b.id} bet={b} now={now} showGroup={groupIds.length > 1} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

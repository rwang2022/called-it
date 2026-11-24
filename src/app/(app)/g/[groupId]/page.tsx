import Link from "next/link";
import { PartyPopper, Plus } from "lucide-react";
import { requireMember } from "@/lib/data/common";
import { groupBets } from "@/lib/data/bets";
import { groupActivity } from "@/lib/data/activity";
import { housekeeping } from "@/lib/server/housekeeping";
import { CATEGORIES } from "@/lib/categories";
import { BetCard } from "@/components/bet/bet-card";
import { ActivityFeed } from "@/components/activity-feed";
import { CategoryIcon } from "@/components/ui/category";
import { EmptyState, SectionHeader } from "@/components/ui/section";
import { CopyInvite } from "@/components/group/group-chrome";
import { requestNow } from "@/lib/now";

export const maxDuration = 300;

const FILTERS = [
  { id: "live", label: "Live" },
  { id: "open", label: "Open to join" },
  { id: "call", label: "Needs a call" },
  { id: "settled", label: "Settled" },
  { id: "all", label: "All" },
] as const;

type Props = { params: Promise<{ groupId: string }>; searchParams: Promise<{ f?: string; cat?: string; welcome?: string }> };

export async function generateMetadata({ params }: Props) {
  const { groupId } = await params;
  const { group } = await requireMember(groupId);
  return { title: group.name };
}

export default async function GroupPage({ params, searchParams }: Props) {
  const { groupId } = await params;
  const sp = await searchParams;
  const { user, group } = await requireMember(groupId);
  await housekeeping([groupId]);
  const now = requestNow();
  const [all, feed] = await Promise.all([groupBets(groupId, user.id), groupActivity(groupId, 16)]);
  const f = FILTERS.some((x) => x.id === sp.f) ? sp.f! : "live";
  const cat = CATEGORIES.some((c) => c.id === sp.cat) ? sp.cat : undefined;

  const byFilter = all.filter((b) => {
    if (f === "live") return b.status !== "settled" && b.status !== "cancelled";
    if (f === "open") return b.phase === "open";
    if (f === "call") return b.phase === "awaiting" || b.phase === "proposed" || b.phase === "disputed";
    if (f === "settled") return b.status === "settled";
    return b.status !== "cancelled" || f === "all";
  });
  const list = byFilter
    .filter((b) => !cat || b.category === cat)
    .sort((a, b) => {
      if (f === "settled") return (b.settledAt ?? 0) - (a.settledAt ?? 0);
      if (f === "live" || f === "open") {
        // Soonest deadline first: open bets by close time, then the rest by result time.
        const k = (x: typeof a) => (x.phase === "open" ? x.closesAt : x.resolvesAt + 1e13);
        return k(a) - k(b);
      }
      return b.createdAt - a.createdAt;
    });
  const usedCats = CATEGORIES.filter((c) => byFilter.some((b) => b.category === c.id));
  const href = (next: { f?: string; cat?: string | null }) => {
    const q = new URLSearchParams();
    const ff = next.f ?? f;
    const cc = next.cat === null ? undefined : (next.cat ?? cat);
    if (ff !== "live") q.set("f", ff);
    if (cc) q.set("cat", cc);
    const s = q.toString();
    return `/g/${groupId}${s ? `?${s}` : ""}`;
  };

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        {sp.welcome === "1" && (
          <div className="surface mb-6 flex animate-rise flex-col gap-4 border-iris/30 bg-iris/10 p-5 sm:flex-row sm:items-center">
            <PartyPopper className="size-7 shrink-0 text-iris" />
            <div className="flex-1">
              <p className="font-semibold">Your group is ready.</p>
              <p className="text-sm text-soft">Send the invite link to your friends, then post the first bet.</p>
            </div>
            <CopyInvite code={group.inviteCode} />
          </div>
        )}

        <div className="scrollbar-none -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {FILTERS.map((x) => (
            <Link key={x.id} href={href({ f: x.id, cat: null })} className={`btn btn-sm shrink-0 ${f === x.id ? "btn-light" : "btn-ghost"}`}>
              {x.label}
            </Link>
          ))}
        </div>
        {usedCats.length > 1 && (
          <div className="scrollbar-none -mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {usedCats.map((c) => (
              <Link
                key={c.id}
                href={href({ cat: cat === c.id ? null : c.id })}
                className={`chip h-8 shrink-0 px-3 transition-colors ${cat === c.id ? "text-fg" : "hover:text-fg"}`}
                style={cat === c.id ? { background: `oklch(0.78 0.13 ${c.hue} / .16)`, borderColor: `oklch(0.78 0.13 ${c.hue} / .5)` } : undefined}
              >
                <CategoryIcon id={c.id} className="size-3.5" /> {c.label}
              </Link>
            ))}
          </div>
        )}

        {list.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((b, i) => (
              <BetCard key={b.id} bet={b} now={now} index={i} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={all.length === 0 ? "No bets yet" : "Nothing here"}
            action={
              <Link href={`/bets/new?group=${groupId}`} className="btn btn-primary">
                <Plus className="size-4" /> Post a bet
              </Link>
            }
          >
            {all.length === 0 ? "Somebody has to go first. Make it a good one." : "No bets match this filter."}
          </EmptyState>
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

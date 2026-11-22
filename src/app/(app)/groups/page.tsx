import Link from "next/link";
import { and, count, eq, inArray, notInArray } from "drizzle-orm";
import { ChevronRight, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { bets, groupMembers, groups } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current";
import { PageTitle } from "@/components/ui/section";
import { JoinByCode } from "@/components/join-by-code";

export const metadata = { title: "Groups" };

export default async function GroupsPage() {
  const user = await requireUser();
  const mine = await db
    .select({ id: groups.id, name: groups.name, hue: groups.hue })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, user.id))
    .orderBy(groupMembers.joinedAt);
  const ids = mine.map((g) => g.id);
  const [memberCounts, liveCounts] = ids.length
    ? await Promise.all([
        db.select({ id: groupMembers.groupId, n: count() }).from(groupMembers).where(inArray(groupMembers.groupId, ids)).groupBy(groupMembers.groupId),
        db
          .select({ id: bets.groupId, n: count() })
          .from(bets)
          .where(and(inArray(bets.groupId, ids), notInArray(bets.status, ["settled", "cancelled"])))
          .groupBy(bets.groupId),
      ])
    : [[], []];
  const mc = new Map(memberCounts.map((r) => [r.id, r.n]));
  const lc = new Map(liveCounts.map((r) => [r.id, r.n]));

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Your groups">Each group has its own bets, leaderboard and ledger.</PageTitle>
      <div className="space-y-3">
        {mine.map((g, i) => (
          <Link key={g.id} href={`/g/${g.id}`} className="surface surface-hover flex animate-rise items-center gap-4 p-4" style={{ animationDelay: `${i * 50}ms` }}>
            <span
              className="grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-bold text-ink-950"
              style={{ background: `linear-gradient(135deg, oklch(0.84 0.13 ${g.hue}), oklch(0.64 0.17 ${(g.hue + 40) % 360}))` }}
            >
              {g.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-semibold">{g.name}</span>
              <span className="text-sm text-muted">
                {mc.get(g.id) ?? 1} members · {lc.get(g.id) ?? 0} live bets
              </span>
            </span>
            <ChevronRight className="size-5 text-faint" />
          </Link>
        ))}
        <Link href="/groups/new" className="flex h-16 items-center justify-center gap-2 rounded-[20px] border border-dashed border-white/15 text-muted transition-colors hover:border-white/30 hover:text-fg">
          <Plus className="size-4" /> New group
        </Link>
      </div>
      <div className="surface mt-8 p-5">
        <p className="label">Join with an invite link</p>
        <JoinByCode />
      </div>
    </div>
  );
}

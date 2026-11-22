import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { groupMembers, groups } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current";
import { attentionFor } from "@/lib/data/bets";
import { pendingPaymentsFor } from "@/lib/data/ledger";
import { BottomNav, MobileHeader, Sidebar } from "@/components/shell/nav";
import { PushSync } from "@/components/push/push-sync";
import { PresenceHeartbeat } from "@/components/presence/presence";
import { pushConfigured } from "@/lib/notify";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const myGroups = await db
    .select({ id: groups.id, name: groups.name, hue: groups.hue })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, user.id))
    .orderBy(groupMembers.joinedAt);
  const [attention, pendingPays] = await Promise.all([
    attentionFor(user.id, myGroups.map((g) => g.id)),
    pendingPaymentsFor(user.id),
  ]);
  const inbox = attention.length + pendingPays.length;

  return (
    <div className="flex min-h-dvh">
      <Sidebar user={user} groups={myGroups} inbox={inbox} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-[calc(110px+var(--safe-bottom))] pt-5 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
          {children}
        </main>
      </div>
      <BottomNav userId={user.id} inbox={inbox} />
      <PushSync enabled={pushConfigured()} />
      <PresenceHeartbeat />
    </div>
  );
}

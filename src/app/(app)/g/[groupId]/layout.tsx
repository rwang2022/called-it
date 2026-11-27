import Link from "next/link";
import { Plus } from "lucide-react";
import { groupMemberList, requireMember } from "@/lib/data/common";
import { AvatarStack } from "@/components/ui/avatar";
import { CopyInvite, GroupTabs } from "@/components/group/group-chrome";
import { OnlineNow } from "@/components/presence/presence";
import { requestNow } from "@/lib/now";
import { GroupMonogram, HueGlow } from "@/components/ui/slip";
import { viewerTimeZone } from "@/lib/tz";

export default async function GroupLayout({ children, params }: { children: React.ReactNode; params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { group, user } = await requireMember(groupId);
  const members = await groupMemberList(groupId);
  const est = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: await viewerTimeZone() }).format(group.createdAt);
  return (
    <div>
      {/* Every group is its own room, lit in its own colour */}
      <HueGlow hue={group.hue} at="100% -12%" strength={0.16} />
      <header className="mb-6 flex animate-rise flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <GroupMonogram name={group.name} hue={group.hue} className="size-16 rounded-[20px] text-[2.4rem]" />
          <div className="min-w-0">
            <p className="eyebrow mb-1.5" style={{ color: `oklch(0.82 0.1 ${group.hue})` }}>
              Est. {est}
            </p>
            <h1 className="display truncate text-[2.4rem] leading-none sm:text-[3rem]">{group.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <AvatarStack users={members} max={6} size="xs" />
              {members.length} {members.length === 1 ? "member" : "members"}
              <OnlineNow
                groupId={group.id}
                viewerId={user.id}
                serverNow={requestNow()}
                members={members.map((m) => ({ id: m.id, name: m.name, image: m.image, isBot: m.isBot, lastSeenAt: m.lastSeenAt?.getTime() ?? null }))}
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <CopyInvite code={group.inviteCode} compact />
          <Link href={`/bets/new?group=${group.id}`} className="btn btn-primary btn-sm">
            <Plus className="size-4" /> New bet
          </Link>
        </div>
      </header>
      <GroupTabs groupId={group.id} hue={group.hue} />
      {children}
    </div>
  );
}

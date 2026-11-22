import Link from "next/link";
import { Plus } from "lucide-react";
import { groupMemberList, requireMember } from "@/lib/data/common";
import { AvatarStack } from "@/components/ui/avatar";
import { CopyInvite, GroupTabs } from "@/components/group/group-chrome";

export default async function GroupLayout({ children, params }: { children: React.ReactNode; params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { group } = await requireMember(groupId);
  const members = await groupMemberList(groupId);
  return (
    <div>
      <header className="mb-6 flex animate-rise flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            className="grid size-14 shrink-0 place-items-center rounded-2xl text-2xl font-bold text-ink-950 shadow-lg"
            style={{
              background: `linear-gradient(135deg, oklch(0.84 0.13 ${group.hue}), oklch(0.64 0.17 ${(group.hue + 40) % 360}))`,
              boxShadow: `0 12px 32px -12px oklch(0.7 0.17 ${group.hue})`,
            }}
          >
            {group.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="display truncate text-[2.3rem] leading-none sm:text-[2.8rem]">{group.name}</h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted">
              <AvatarStack users={members} max={6} size="xs" />
              {members.length} {members.length === 1 ? "member" : "members"}
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
      <GroupTabs groupId={group.id} />
      {children}
    </div>
  );
}

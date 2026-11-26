import Link from "next/link";
import { Crown } from "lucide-react";
import { groupMemberList, requireMember } from "@/lib/data/common";
import { viewerTimeZone } from "@/lib/tz";
import { formatDate, relativeTime } from "@/lib/format";
import { isOnline } from "@/lib/presence";
import { NEW_MEMBER_MS, onProbation } from "@/lib/engine/rating";
import { requestNow } from "@/lib/now";
import { OnlineDot } from "@/components/presence/presence";
import { Avatar } from "@/components/ui/avatar";
import { CopyInvite } from "@/components/group/group-chrome";
import { LeaveGroupButton, NewBetPushToggle, RemoveMemberButton, RenameGroupForm, ResetInviteButton } from "@/components/group/member-actions";

export const metadata = { title: "Members" };

export default async function MembersPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { user, group, role } = await requireMember(groupId);
  const [members, tz] = await Promise.all([groupMemberList(groupId), viewerTimeZone()]);
  const owner = role === "owner";
  const now = requestNow();

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="surface overflow-hidden">
        <ul className="divide-y divide-white/[0.06]">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
              <Link href={`/u/${m.id}`} className="relative shrink-0">
                <Avatar user={m} size="md" />
                {!m.isBot && isOnline(m.lastSeenAt, now) && <OnlineDot />}
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/u/${m.id}`} className="flex items-center gap-1.5 font-semibold hover:underline">
                  {m.name}
                  {m.id === user.id && <span className="text-xs font-normal text-muted">(you)</span>}
                  {m.role === "owner" && <Crown className="size-3.5 text-gold" aria-label="Owner" />}
                  {onProbation(m.joinedAt.getTime(), group.createdAt.getTime(), now) && (
                    <span
                      className="rounded-full bg-iris/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-iris"
                      title={`New members' picks start counting toward scores on ${formatDate(m.joinedAt.getTime() + NEW_MEMBER_MS, tz)}.`}
                    >
                      New
                    </span>
                  )}
                </Link>
                <p className="text-xs text-muted">
                  {m.isBot ? null : isOnline(m.lastSeenAt, now) ? (
                    <span className="text-yes">Online now · </span>
                  ) : m.lastSeenAt ? (
                    <>Active {relativeTime(m.lastSeenAt.getTime(), now)} · </>
                  ) : null}
                  Joined {formatDate(m.joinedAt, tz)}
                </p>
              </div>
              {owner && m.id !== user.id && <RemoveMemberButton groupId={groupId} userId={m.id} />}
            </li>
          ))}
        </ul>
      </section>

      <aside className="space-y-6">
        <section className="surface p-5">
          <h2 className="eyebrow mb-3">Invite friends</h2>
          <p className="mb-4 text-sm text-muted">Anyone with the link can join after signing in. Reset it if it leaks.</p>
          <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 font-mono text-sm tracking-wider text-soft">
            /join/{group.inviteCode}
          </div>
          <div className="flex gap-2">
            <CopyInvite code={group.inviteCode} />
            {owner && <ResetInviteButton groupId={groupId} />}
          </div>
        </section>
        {owner && (
          <section className="surface p-5">
            <h2 className="eyebrow mb-3">Group settings</h2>
            <RenameGroupForm groupId={groupId} name={group.name} hue={group.hue} />
          </section>
        )}
        <section className="surface p-5">
          <h2 className="eyebrow mb-3">Your notifications</h2>
          <NewBetPushToggle groupId={groupId} on={!(members.find((m) => m.id === user.id)?.muteNewBets ?? false)} />
        </section>
        <section className="surface p-5">
          <h2 className="eyebrow mb-3">Leave</h2>
          <p className="mb-4 text-sm text-muted">You can leave once you have no live bets and your balance is square.</p>
          <LeaveGroupButton groupId={groupId} />
        </section>
      </aside>
    </div>
  );
}

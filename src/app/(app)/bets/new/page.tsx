import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { Users } from "lucide-react";
import { db } from "@/lib/db";
import { groupMembers, groups, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current";
import { claudeEnabled } from "@/lib/claude/agent";
import { EmptyState } from "@/components/ui/section";
import { CreateBetWizard } from "@/components/create/wizard";

export const metadata = { title: "New bet" };
// Claude's sealed pick runs in after() once the bet is posted; give it room.
export const maxDuration = 300;

export default async function NewBetPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const mine = await db
    .select({ id: groups.id, name: groups.name, hue: groups.hue })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, user.id))
    .orderBy(groupMembers.joinedAt);

  if (mine.length === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState
          icon={<Users className="size-6" />}
          title="First, a group"
          action={
            <Link href="/groups/new" className="btn btn-primary">
              Create a group
            </Link>
          }
        >
          Bets live inside groups of friends so only they can see them.
        </EmptyState>
      </div>
    );
  }

  const members = await db
    .select({ groupId: groupMembers.groupId, id: users.id, name: users.name, image: users.image })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(inArray(groupMembers.groupId, mine.map((g) => g.id)));

  const initialGroup = mine.find((g) => g.id === sp.group)?.id ?? mine[0].id;

  return (
    <CreateBetWizard
      me={{ id: user.id, name: user.name, image: user.image }}
      groups={mine.map((g) => ({ ...g, members: members.filter((m) => m.groupId === g.id).map(({ id, name, image }) => ({ id, name, image })) }))}
      initialGroupId={initialGroup}
      claudeOn={claudeEnabled()}
    />
  );
}

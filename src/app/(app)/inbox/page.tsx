import { Inbox as InboxIcon } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { myGroupIds, usersById } from "@/lib/data/common";
import { attentionFor } from "@/lib/data/bets";
import { pendingPaymentsFor } from "@/lib/data/ledger";
import { housekeeping } from "@/lib/server/housekeeping";
import { AttentionList } from "@/components/attention-list";
import { EmptyState, PageTitle } from "@/components/ui/section";
import { requestNow } from "@/lib/now";

export const metadata = { title: "Inbox" };
export const maxDuration = 300;

export default async function InboxPage() {
  const user = await requireUser();
  const groupIds = await myGroupIds(user.id);
  await housekeeping(groupIds);
  const [items, pays] = await Promise.all([attentionFor(user.id, groupIds), pendingPaymentsFor(user.id)]);
  const payers = await usersById(pays.map((p) => p.fromId));
  const now = requestNow();
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Inbox">Calls to make, calls to review, votes, challenges and payments waiting on you.</PageTitle>
      {items.length + pays.length === 0 ? (
        <EmptyState icon={<InboxIcon className="size-6" />} title="All caught up">
          Nothing needs you right now. Go stir something up.
        </EmptyState>
      ) : (
        <AttentionList
          items={items}
          payments={pays.map((p) => ({ id: p.id, amountCents: p.amountCents, fromName: payers.get(p.fromId)?.name ?? "Someone", groupId: p.groupId }))}
          now={now}
        />
      )}
    </div>
  );
}

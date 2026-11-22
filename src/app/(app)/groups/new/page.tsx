import { requireUser } from "@/lib/auth/current";
import { PageTitle } from "@/components/ui/section";
import { NewGroupForm } from "@/components/group/new-group-form";

export const metadata = { title: "New group" };

export default async function NewGroupPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-lg">
      <PageTitle eyebrow="New group" title="Name your crew">
        You&apos;ll get an invite link to drop in the group chat.
      </PageTitle>
      <NewGroupForm />
    </div>
  );
}

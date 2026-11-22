import Link from "next/link";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { groupMembers, groups } from "@/lib/db/schema";
import { getCurrentUser, devLoginEnabled } from "@/lib/auth/current";
import { membership } from "@/lib/data/common";
import { Logo } from "@/components/ui/logo";
import { JoinButton } from "@/components/group/join-button";

export const metadata = { title: "Join group", robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.trim().toUpperCase();
  const group = /^[A-Z0-9]{6,16}$/.test(clean)
    ? await db.select({ id: groups.id, name: groups.name, hue: groups.hue, inviteCode: groups.inviteCode }).from(groups).where(eq(groups.inviteCode, clean)).get()
    : undefined;
  const user = await getCurrentUser();
  if (group && user && (await membership(group.id, user.id))) redirect(`/g/${group.id}`);
  const [{ n } = { n: 0 }] = group ? await db.select({ n: count() }).from(groupMembers).where(eq(groupMembers.groupId, group.id)) : [];
  const next = `/join/${clean}`;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-10">
        <Logo />
      </Link>
      <div className="surface w-full max-w-md animate-rise p-8 text-center">
        {group ? (
          <>
            <span
              className="mx-auto mb-5 grid size-20 place-items-center rounded-3xl text-4xl font-bold text-ink-950"
              style={{
                background: `linear-gradient(135deg, oklch(0.84 0.13 ${group.hue}), oklch(0.64 0.17 ${(group.hue + 40) % 360}))`,
                boxShadow: `0 18px 40px -14px oklch(0.7 0.17 ${group.hue})`,
              }}
            >
              {group.name.slice(0, 1).toUpperCase()}
            </span>
            <p className="eyebrow mb-2">You&apos;re invited to</p>
            <h1 className="display text-4xl">{group.name}</h1>
            <p className="mt-2 text-sm text-muted">
              {n} {n === 1 ? "member" : "members"} making bets and keeping score.
            </p>
            <div className="mt-8">
              {user ? (
                <JoinButton code={clean} />
              ) : (
                <div className="space-y-3">
                  <a href={`/api/auth/google?next=${encodeURIComponent(next)}`} className="btn btn-light btn-lg w-full">
                    Sign in with Google to join
                  </a>
                  <Link href={`/signin?next=${encodeURIComponent(next)}`} className="btn btn-ghost btn-lg w-full">
                    Use a username instead
                  </Link>
                  {devLoginEnabled() && (
                    <a href={`/?next=${encodeURIComponent(next)}`} className="block text-sm text-muted hover:text-fg">
                      Use a demo account (dev)
                    </a>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <h1 className="display text-3xl">That invite doesn&apos;t work</h1>
            <p className="mt-3 text-sm text-muted">The link may be mistyped, or the group owner reset it. Ask them for a fresh one.</p>
            <Link href="/" className="btn btn-ghost mt-6">
              Go home
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

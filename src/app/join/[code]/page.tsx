import Link from "next/link";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { groupMembers, groups } from "@/lib/db/schema";
import type { Metadata } from "next";
import { appUrl, getCurrentUser, devLoginEnabled } from "@/lib/auth/current";
import { inviteTeaser } from "@/lib/data/share";
import { APP_NAME } from "@/lib/brand";
import { membership } from "@/lib/data/common";
import { Logo } from "@/components/ui/logo";
import { JoinButton } from "@/components/group/join-button";
import { GoogleG } from "@/components/auth/google-g";
import { GroupMonogram, HueGlow, Slip, StubText } from "@/components/ui/slip";
import { ticketNumber } from "@/lib/ticket-art";

type Props = { params: Promise<{ code: string }> };

/** Invite links unfurl in chats with the group's name and size (what this page already shows anyone). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = await inviteTeaser((await params).code);
  if (!g) return { title: "Join group", robots: { index: false } };
  const title = `Join ${g.name} on ${APP_NAME}`;
  const description = `${g.members} ${g.members === 1 ? "member" : "members"} making bets and keeping score.`;
  return {
    metadataBase: new URL(appUrl()),
    title: { absolute: title },
    description,
    // robots.txt keeps search engines off invite links; preview bots are allowed.
    openGraph: { title, description, siteName: APP_NAME, type: "website", url: `/join/${g.code}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function JoinPage({ params }: Props) {
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
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12 sm:py-16">
      {group && <HueGlow hue={group.hue} />}
      <Link href="/" className="mb-10 animate-fade">
        <Logo />
      </Link>
      {group ? (
        <>
          {/* An admission ticket: the same slip the invite link unfurls as */}
          <Slip
            hue={group.hue}
            className="w-full max-w-[720px] animate-rise"
            bodyClassName="px-8 pb-9 pt-9 sm:px-11 sm:pb-11 sm:pt-11"
            stubClassName="px-8 py-7 sm:w-[220px] sm:px-9 sm:py-11"
            stub={
              <StubText
                kicker="Admits one"
                word={String(n)}
                detail={n === 1 ? "member so far" : "members calling it"}
                color="var(--color-gold)"
                serial={ticketNumber(group.inviteCode)}
                split="sm"
              />
            }
          >
            <div className="flex items-center gap-3">
              <GroupMonogram name={group.name} hue={group.hue} className="size-9 rounded-xl text-[1.35rem]" />
              <p className="eyebrow" style={{ color: `oklch(0.82 0.1 ${group.hue})` }}>
                You&apos;re invited
              </p>
            </div>
            <h1 className="display mt-5 text-[2.6rem] leading-[1.04] sm:text-[3.4rem]">
              Join <em>{group.name}</em>
            </h1>
            <p className="mt-4 max-w-md leading-relaxed text-soft">
              Bets and predictions between friends, with honest track records and Claude at the table.
            </p>
          </Slip>
          <div className="mt-9 w-full max-w-[400px] animate-rise [animation-delay:120ms]">
            {user ? (
              <JoinButton code={clean} />
            ) : (
              <div className="space-y-3">
                <a href={`/api/auth/google?next=${encodeURIComponent(next)}`} className="btn btn-light btn-lg w-full gap-3">
                  <GoogleG /> Sign in with Google to join
                </a>
                <Link href={`/signin?next=${encodeURIComponent(next)}`} className="btn btn-ghost btn-lg w-full">
                  Use a username instead
                </Link>
                {devLoginEnabled() && (
                  <a href={`/?next=${encodeURIComponent(next)}`} className="block text-center text-sm text-muted hover:text-fg">
                    Use a demo account (dev)
                  </a>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <Slip
            hue={350}
            className="w-full max-w-[640px] animate-rise"
            bodyClassName="px-8 pb-9 pt-9 sm:px-10 sm:pb-10 sm:pt-10"
            stubClassName="px-8 py-7 sm:w-[200px] sm:px-8 sm:py-10"
            stub={<StubText kicker="This invite" word="Void" detail="ask for a fresh one" color="var(--color-no)" split="sm" />}
          >
            <p className="eyebrow">Invite link</p>
            <h1 className="display mt-4 text-[2.3rem] leading-[1.05] sm:text-[2.8rem]">That invite doesn&apos;t work</h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              The link may be mistyped, or the group owner reset it. Ask them for a fresh one.
            </p>
          </Slip>
          <Link href="/" className="btn btn-ghost mt-9">
            Go home
          </Link>
        </>
      )}
    </div>
  );
}

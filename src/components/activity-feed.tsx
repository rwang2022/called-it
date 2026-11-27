import Link from "next/link";
import type { recentActivity } from "@/lib/data/activity";
import { firstName, money, relativeTime } from "@/lib/format";
import { Avatar } from "./ui/avatar";
import { LogoMark } from "./ui/logo";
import { smartQuotes } from "@/lib/ticket-art";

type Row = Awaited<ReturnType<typeof recentActivity>>[number];

function describe(r: Row) {
  const who = r.actor ? firstName(r.actor.name) : "Someone";
  const title = r.betTitle ? `“${smartQuotes(r.betTitle)}”` : "a bet";
  switch (r.type) {
    case "bet_created":
      return <><b>{who}</b> posted {title}</>;
    case "position_taken":
      return <><b>{who}</b> took a side on {title}</>;
    case "challenge_accepted":
      return <><b>{who}</b> accepted the challenge {title}</>;
    case "proposed":
      return <><b>{who}</b> made the call on {title}</>;
    case "disputed":
      return <><b>{who}</b> disputed the call on {title}</>;
    case "settled":
      return <>{title} is settled</>;
    case "cancelled":
      return <><b>{who}</b> cancelled {title}</>;
    case "member_joined":
      return <><b>{who}</b> joined the group</>;
    case "payment_recorded":
      return <><b>{who}</b> says they paid {typeof r.data?.amountCents === "number" ? money(r.data.amountCents) : ""}</>;
    case "payment_confirmed":
      return <><b>{who}</b> confirmed a {typeof r.data?.amountCents === "number" ? money(r.data.amountCents) : ""} payment</>;
    case "claude_predicted":
      return <><b>Claude</b> locked in a sealed pick on {title}</>;
    default:
      return <>{who} did something</>;
  }
}

export function ActivityFeed({ rows, now }: { rows: Row[]; now: number }) {
  if (rows.length === 0) return <p className="text-sm text-faint">Nothing yet. Post the first bet.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-white/[0.07]">
      {rows.map((r) => {
        const body = (
          <div className="flex gap-3">
            <span className="relative z-10 shrink-0">
              {r.actor ? <Avatar user={r.actor} size="sm" ring /> : <span className="block size-7 overflow-hidden rounded-full ring-2 ring-ink-900"><LogoMark className="size-7" /></span>}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[0.88rem] leading-snug text-soft [&_b]:font-semibold [&_b]:text-fg">{describe(r)}</p>
              <p className="mt-0.5 text-xs text-faint">{relativeTime(r.createdAt, now)}</p>
            </div>
          </div>
        );
        return (
          <li key={r.id}>
            {r.betId ? (
              <Link href={`/bets/${r.betId}`} className="block rounded-xl transition-opacity hover:opacity-80">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}

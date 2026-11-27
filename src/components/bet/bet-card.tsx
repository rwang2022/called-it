import Link from "next/link";
import { Lock, Swords } from "lucide-react";
import type { BetVM } from "@/lib/data/bets";
import { firstName, signedMoney } from "@/lib/format";
import { Avatar, AvatarStack, ClaudeGlyph } from "../ui/avatar";
import { CategoryIcon } from "../ui/category";
import { categoryOf } from "@/lib/categories";
import { smartQuotes } from "@/lib/ticket-art";
import { BinaryBar, MultiBars, PotLabel } from "./odds";
import { StatusPill } from "./status-pill";

function MyPick({ bet }: { bet: BetVM }) {
  if (bet.myResult && bet.status === "settled") {
    const net = bet.myNetCents ?? 0;
    const color = bet.myResult === "win" ? "text-yes" : bet.myResult === "loss" ? "text-no" : "text-muted";
    return (
      <span className={`chip ${color}`} style={{ borderColor: "currentColor", background: "transparent" }}>
        {bet.myResult === "win" ? "Won" : bet.myResult === "loss" ? "Lost" : "Push"}
        {bet.stakeMode === "money" && net !== 0 && <span className="num">{signedMoney(net)}</span>}
      </span>
    );
  }
  if (!bet.mine) return null;
  const label = bet.kind === "challenge" ? "You're in" : (bet.options.find((o) => o.id === bet.mine!.optionId)?.label ?? "In");
  return <span className="chip text-fg">You: {label}</span>;
}

function ClaudeBadge({ bet }: { bet: BetVM }) {
  const c = bet.claude;
  if (c.state === "none" || c.state === "failed") return null;
  if (c.state === "revealed") {
    const opt = bet.options.find((o) => o.id === c.position.optionId);
    return (
      <span className="chip gap-1.5 text-claude" style={{ borderColor: "color-mix(in oklab, var(--color-claude) 30%, transparent)" }}>
        <span className="inline-block size-3.5 shrink-0"><ClaudeGlyph /></span>
        {opt?.label} <span className="num opacity-75">{c.position.confidence}%</span>
      </span>
    );
  }
  return (
    <span className="chip gap-1.5 text-claude/90" title={c.state === "sealed" ? "Claude's pick is sealed until betting closes" : "Claude is researching"}>
      <span className="inline-block size-3.5 shrink-0"><ClaudeGlyph /></span>
      {c.state === "sealed" ? <Lock className="size-3" /> : <span className="animate-pulse">thinking…</span>}
    </span>
  );
}

/**
 * A bet in a list: a small wager slip. The question and the market on the
 * ticket, who's in and what's riding on it on a perforated stub, tinted with
 * the group's colour.
 */
export function BetCard({ bet, now, showGroup = false, index = 0 }: { bet: BetVM; now: number; showGroup?: boolean; index?: number }) {
  const people = bet.positions.map((p) => p.user);
  const h = bet.group.hue;
  return (
    <Link
      href={`/bets/${bet.id}`}
      className="slip-card group relative flex animate-rise flex-col overflow-hidden"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="flex-1 p-4 pb-4 sm:p-5 sm:pb-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div
            className="flex min-w-0 items-center gap-2 text-[0.66rem] font-semibold uppercase tracking-[0.18em]"
            style={{ color: showGroup ? `oklch(0.82 0.1 ${h})` : "var(--color-muted)" }}
          >
            <CategoryIcon id={bet.category} className="size-3.5 shrink-0" />
            <span className="truncate">{showGroup ? bet.group.name : categoryOf(bet.category).label}</span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <ClaudeBadge bet={bet} />
            <MyPick bet={bet} />
          </span>
        </div>

        <h3 className="display mb-4 line-clamp-3 text-[1.5rem] leading-[1.1] text-fg transition-colors group-hover:text-white sm:text-[1.65rem]">
          {smartQuotes(bet.title)}
        </h3>

        <div>
          {bet.kind === "binary" && <BinaryBar bet={bet} />}
          {bet.kind === "multi" && <MultiBars bet={bet} />}
          {bet.kind === "challenge" && <ChallengeLine bet={bet} />}
        </div>
      </div>

      {/* The stub, behind a perforation */}
      <div
        className="relative flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t-2 border-dashed border-white/[0.1] px-4 py-3 text-sm sm:px-5"
        style={{ backgroundImage: `linear-gradient(180deg, oklch(0.6 0.12 ${h} / 0.03), oklch(0.6 0.14 ${h} / 0.09))` }}
      >
        <span aria-hidden className="notch -left-2 -top-[9px] size-4" />
        <span aria-hidden className="notch -right-2 -top-[9px] size-4" />
        <StatusPill
          bare
          short
          phase={bet.phase}
          closesAt={bet.closesAt}
          resolvesAt={bet.resolvesAt}
          reviewDeadline={bet.reviewDeadline}
          voteDeadline={bet.voteDeadline}
          now={now}
        />
        <span className="ml-auto flex items-center gap-2.5">
          {people.length > 0 ? <AvatarStack users={people} max={3} size="xs" /> : <span className="text-xs text-faint">No takers yet</span>}
          <span className="text-sm">
            <PotLabel bet={bet} />
          </span>
        </span>
      </div>
    </Link>
  );
}

function ChallengeLine({ bet }: { bet: BetVM }) {
  const ps = bet.positions;
  const results = bet.status === "settled" && bet.outcome?.type === "challenge" ? bet.outcome.results : null;
  if (ps.length === 0) return null;
  return (
    <div className="space-y-2">
      {ps.slice(0, 3).map((p) => (
        <div key={p.id} className="flex items-center gap-2.5 text-sm">
          <Avatar user={p.user} size="xs" />
          <span className="font-medium text-soft">{firstName(p.user.name)}</span>
          <span className="truncate text-muted">{p.task}</span>
          {results && (
            <span className={`ml-auto shrink-0 text-xs font-semibold ${results[p.id] === "pass" ? "text-yes" : "text-no"}`}>
              {results[p.id] === "pass" ? "Done" : "Failed"}
            </span>
          )}
        </div>
      ))}
      {ps.length === 1 && bet.challengeOpponent && (
        <div className="flex items-center gap-2.5 text-sm text-muted">
          <Swords className="size-4 text-faint" />
          Waiting on {firstName(bet.challengeOpponent.name)} to accept
        </div>
      )}
    </div>
  );
}

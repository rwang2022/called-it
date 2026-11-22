import Link from "next/link";
import { Lock, Swords } from "lucide-react";
import type { BetVM } from "@/lib/data/bets";
import { firstName, signedMoney } from "@/lib/format";
import { Avatar, AvatarStack, ClaudeGlyph } from "../ui/avatar";
import { CategoryIcon } from "../ui/category";
import { categoryOf } from "@/lib/categories";
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

export function BetCard({ bet, now, showGroup = false, index = 0 }: { bet: BetVM; now: number; showGroup?: boolean; index?: number }) {
  const people = bet.positions.map((p) => p.user);
  return (
    <Link
      href={`/bets/${bet.id}`}
      className="surface surface-hover group block animate-rise p-4 sm:p-5"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
          <CategoryIcon id={bet.category} className="size-4 shrink-0" />
          <span className="truncate font-medium text-soft">{showGroup ? bet.group.name : categoryOf(bet.category).label}</span>
        </div>
        <StatusPill
          short
          phase={bet.phase}
          closesAt={bet.closesAt}
          resolvesAt={bet.resolvesAt}
          reviewDeadline={bet.reviewDeadline}
          voteDeadline={bet.voteDeadline}
          now={now}
        />
      </div>

      <h3 className="display mb-4 line-clamp-3 text-[1.45rem] leading-[1.12] text-fg transition-colors group-hover:text-white sm:text-[1.6rem]">
        {bet.title}
      </h3>

      <div className="mb-4">
        {bet.kind === "binary" && <BinaryBar bet={bet} />}
        {bet.kind === "multi" && <MultiBars bet={bet} />}
        {bet.kind === "challenge" && <ChallengeLine bet={bet} />}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {people.length > 0 ? <AvatarStack users={people} max={5} size="xs" /> : <span className="text-xs text-faint">No takers yet</span>}
        <span className="text-sm">
          <PotLabel bet={bet} />
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <ClaudeBadge bet={bet} />
          <MyPick bet={bet} />
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

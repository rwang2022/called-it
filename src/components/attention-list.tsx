import Link from "next/link";
import { ChevronRight, Gavel, HandCoins, Hourglass, Swords, Vote } from "lucide-react";
import type { AttentionItem } from "@/lib/data/bets";
import { firstName, money } from "@/lib/format";
import { ClaudeGlyph } from "./ui/avatar";
import { Countdown } from "./ui/countdown";

const META = {
  judge: { label: "Make the call", icon: Gavel, color: "#fbbf24" },
  claude_fallback: { label: "Claude couldn't call it — you can", icon: Gavel, color: "#e8845f" },
  review: { label: "Confirm or dispute the call", icon: Hourglass, color: "#5ccbff" },
  vote: { label: "Vote on the dispute", icon: Vote, color: "#fb7185" },
  challenge: { label: "You've been challenged", icon: Swords, color: "#8e7dff" },
} as const;

export type PaymentAttention = {
  id: string;
  amountCents: number;
  fromName: string;
  groupId: string;
};

export function AttentionList({ items, payments = [], now }: { items: AttentionItem[]; payments?: PaymentAttention[]; now: number }) {
  return (
    <div className="surface divide-y divide-white/[0.06] overflow-hidden">
      {items.map(({ kind, bet }) => {
        const m = META[kind];
        const Icon = m.icon;
        const deadline = kind === "review" ? bet.reviewDeadline : kind === "vote" ? bet.voteDeadline : kind === "challenge" ? bet.closesAt : null;
        return (
          <Link key={`${kind}-${bet.id}`} href={`/bets/${bet.id}`} className="flex items-center gap-3.5 p-4 transition-colors hover:bg-white/[0.03]">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl"
              style={{ background: `color-mix(in oklab, ${m.color} 14%, transparent)`, color: m.color }}
            >
              {kind === "claude_fallback" ? <span className="inline-block size-5 shrink-0"><ClaudeGlyph /></span> : <Icon className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold" style={{ color: m.color }}>
                {m.label}
                {kind === "challenge" && <> by {firstName(bet.creator.name)}</>}
              </p>
              <p className="truncate text-[0.95rem] font-medium text-fg">{bet.title}</p>
            </div>
            {deadline && (
              <span className="hidden text-xs text-muted sm:block">
                <Countdown to={deadline} serverNow={now} prefix="" pastLabel="due" /> left
              </span>
            )}
            <ChevronRight className="size-4 shrink-0 text-faint" />
          </Link>
        );
      })}
      {payments.map((p) => (
        <Link key={p.id} href={`/g/${p.groupId}/ledger`} className="flex items-center gap-3.5 p-4 transition-colors hover:bg-white/[0.03]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-yes/15 text-yes">
            <HandCoins className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-yes">Confirm a payment</p>
            <p className="truncate text-[0.95rem] font-medium">
              {firstName(p.fromName)} says they paid you <span className="num">{money(p.amountCents)}</span>
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-faint" />
        </Link>
      ))}
    </div>
  );
}

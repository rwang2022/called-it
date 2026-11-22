import { Check } from "lucide-react";
import type { BetVM } from "@/lib/data/bets";
import { money, pct } from "@/lib/format";
import { optionColor } from "./palette";

const winnerId = (b: BetVM) => (b.status === "settled" && b.outcome?.type === "option" ? b.outcome.optionId : null);

/** Two-tone split bar for yes/no bets. */
export function BinaryBar({ bet, size = "md" }: { bet: BetVM; size?: "md" | "lg" }) {
  const [yes, no] = bet.options;
  const hasAny = yes.count + no.count > 0;
  const y = hasAny ? yes.share : 0.5;
  const win = winnerId(bet);
  const h = size === "lg" ? "h-3" : "h-2";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="flex items-center gap-1.5 font-semibold" style={{ color: optionColor("binary", 0) }}>
          {win === yes.id && <Check className="size-4" strokeWidth={3} />}
          {yes.label} <span className="num font-medium opacity-80">{hasAny ? pct(yes.share) : "—"}</span>
        </span>
        <span className="flex items-center gap-1.5 font-semibold" style={{ color: optionColor("binary", 1) }}>
          <span className="num font-medium opacity-80">{hasAny ? pct(no.share) : "—"}</span> {no.label}
          {win === no.id && <Check className="size-4" strokeWidth={3} />}
        </span>
      </div>
      <div className={`relative flex ${h} gap-0.5 overflow-hidden rounded-full`}>
        {hasAny ? (
          <>
            <div
              className="origin-left animate-grow rounded-l-full"
              style={{
                width: `${y * 100}%`,
                background: `linear-gradient(90deg, #059669, ${optionColor("binary", 0)})`,
                opacity: win && win !== yes.id ? 0.3 : 1,
              }}
            />
            <div
              className="flex-1 origin-right animate-grow rounded-r-full"
              style={{
                background: `linear-gradient(90deg, ${optionColor("binary", 1)}, #e11d48)`,
                opacity: win && win !== no.id ? 0.3 : 1,
              }}
            />
          </>
        ) : (
          <div className="flex-1 rounded-full bg-white/[0.07]" />
        )}
      </div>
    </div>
  );
}

/** Ranked mini-bars for multiple-choice bets. */
export function MultiBars({ bet, limit = 3 }: { bet: BetVM; limit?: number }) {
  const win = winnerId(bet);
  const ranked = bet.options
    .map((o, i) => ({ ...o, color: optionColor("multi", i) }))
    .sort((a, b) => (win ? Number(b.id === win) - Number(a.id === win) : 0) || b.share - a.share);
  const shown = ranked.slice(0, limit);
  const any = bet.options.some((o) => o.count > 0);
  return (
    <div className="space-y-2">
      {shown.map((o) => (
        <div key={o.id} className={win && win !== o.id ? "opacity-45" : ""}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-soft">
              <span className="size-2 shrink-0 rounded-full" style={{ background: o.color }} />
              <span className="truncate">{o.label}</span>
              {win === o.id && <Check className="size-4 shrink-0 text-yes" strokeWidth={3} />}
            </span>
            <span className="num shrink-0 text-xs text-muted">{any ? pct(o.share) : "—"}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full origin-left animate-grow rounded-full" style={{ width: `${any ? Math.max(2, o.share * 100) : 0}%`, background: o.color }} />
          </div>
        </div>
      ))}
      {ranked.length > limit && <p className="text-xs text-faint">+{ranked.length - limit} more</p>}
    </div>
  );
}

export function PotLabel({ bet }: { bet: BetVM }) {
  if (bet.stakeMode === "bragging") return <span className="text-muted">Bragging rights</span>;
  if (bet.kind === "challenge") return <span className="num text-soft">{money(bet.stakeCents)} each</span>;
  return (
    <span className="num text-soft">
      {money(bet.potCents)} <span className="font-sans text-muted">pot</span>
    </span>
  );
}

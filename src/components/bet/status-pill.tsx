import { Ban, CircleCheck, Gavel, Hourglass, Lock, Vote } from "lucide-react";
import type { Phase } from "@/lib/engine/rules";
import { Countdown } from "../ui/countdown";

const STYLE: Record<Phase, { label: string; color: string }> = {
  open: { label: "Open", color: "#34d399" },
  locked: { label: "Locked", color: "#a5b4fc" },
  awaiting: { label: "Awaiting call", color: "#fbbf24" },
  proposed: { label: "Called", color: "#5ccbff" },
  disputed: { label: "Disputed", color: "#fb7185" },
  settled: { label: "Settled", color: "#959cae" },
  cancelled: { label: "Cancelled", color: "#5f6678" },
};

export function StatusPill({
  phase,
  closesAt,
  resolvesAt,
  reviewDeadline,
  voteDeadline,
  now,
  compact = false,
  short = false,
}: {
  phase: Phase;
  closesAt: number;
  resolvesAt: number;
  reviewDeadline: number | null;
  voteDeadline: number | null;
  now: number;
  compact?: boolean;
  /** Countdown without words ("· 3d 4h"), for tight spaces. */
  short?: boolean;
}) {
  const s = STYLE[phase];
  const Icon =
    phase === "locked"
      ? Lock
      : phase === "awaiting"
        ? Gavel
        : phase === "proposed"
          ? Hourglass
          : phase === "disputed"
            ? Vote
            : phase === "settled"
              ? CircleCheck
              : phase === "cancelled"
                ? Ban
                : null;
  const timer =
    phase === "open"
      ? { to: closesAt, prefix: "closes in " }
      : phase === "locked"
        ? { to: resolvesAt, prefix: "result in " }
        : phase === "proposed" && reviewDeadline
          ? { to: reviewDeadline, prefix: "final in " }
          : phase === "disputed" && voteDeadline
            ? { to: voteDeadline, prefix: "vote ends in " }
            : null;
  return (
    <span
      className="chip gap-1.5"
      style={{
        color: s.color,
        background: `color-mix(in oklab, ${s.color} 10%, transparent)`,
        borderColor: `color-mix(in oklab, ${s.color} 24%, transparent)`,
      }}
    >
      {phase === "open" ? (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: s.color }} />
          <span className="relative inline-flex size-1.5 rounded-full" style={{ background: s.color }} />
        </span>
      ) : (
        Icon && <Icon className="size-3.5" />
      )}
      <span>{s.label}</span>
      {timer && !compact && (
        <span className="font-medium opacity-75">
          · <Countdown to={timer.to} serverNow={now} prefix={short ? "" : timer.prefix} />
        </span>
      )}
    </span>
  );
}

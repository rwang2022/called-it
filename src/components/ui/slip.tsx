/**
 * The "wager slip": the ticket that shared bet links unfurl as, used in the app
 * wherever something *is* a bet or a ticket (a bet's header, an invite, a void
 * page). Card stock, a perforated stub with notches where the perforation meets
 * the edge, and a guilloche rosette in the group's hue. Everything else in the
 * app stays plain ink, so the ticket keeps meaning something.
 */

const SPLIT = {
  // Stub always below the body (small slips).
  none: { grid: "", stub: "", notchB: "", rosette: "" },
  // Stub below the body on narrow screens, beside it from this breakpoint up.
  sm: {
    grid: "sm:grid-cols-[minmax(0,1fr)_auto]",
    stub: "sm:border-l-2 sm:border-t-0",
    notchB: "sm:right-auto sm:top-auto sm:-bottom-3.5 sm:-left-3.5",
    rosette: "sm:-right-36 sm:top-24",
  },
  md: {
    grid: "md:grid-cols-[minmax(0,1fr)_auto]",
    stub: "md:border-l-2 md:border-t-0",
    notchB: "md:right-auto md:top-auto md:-bottom-3.5 md:-left-3.5",
    rosette: "md:-right-36 md:top-24",
  },
} as const;

/** The rosette's ink: the same colour the preview card computes with hueRgba(h, .75, .72). */
export const rosetteInk = (hue: number) => `hsl(${hue} 75% 72%)`;

export function Slip({
  hue,
  stub,
  split = "sm",
  stubClassName = "",
  className = "",
  bodyClassName = "",
  children,
}: {
  hue: number;
  stub?: React.ReactNode;
  split?: keyof typeof SPLIT;
  stubClassName?: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const s = SPLIT[split];
  return (
    <article className={`slip grid ${stub ? s.grid : ""} ${className}`}>
      <div className={`relative min-w-0 ${bodyClassName}`}>{children}</div>
      {stub && (
        <aside
          className={`relative border-t-2 border-dashed border-white/[0.14] ${s.stub} ${stubClassName}`}
          style={{ backgroundImage: `linear-gradient(180deg, oklch(0.6 0.12 ${hue} / 0.05), oklch(0.6 0.14 ${hue} / 0.15))` }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className={`rosette absolute -right-28 top-2 w-[320px] opacity-[0.18] ${s.rosette}`} style={{ color: rosetteInk(hue) }} />
          </div>
          <span aria-hidden className="notch -left-3.5 -top-3.5 size-7" />
          <span aria-hidden className={`notch -right-3.5 -top-3.5 size-7 ${s.notchB}`} />
          <div className="relative h-full">{stub}</div>
        </aside>
      )}
    </article>
  );
}

/**
 * What a slip's stub says: a small-caps kicker, one big italic word, a detail
 * line, and a ticket number. With `split`, the stub stands beside the body from
 * that breakpoint and the number moves to its top, as on the shared card.
 */
export function StubText({
  kicker,
  word,
  detail,
  color,
  serial,
  split,
}: {
  kicker: string;
  word: React.ReactNode;
  detail?: React.ReactNode;
  color?: string;
  serial?: string;
  split?: "sm" | "md";
}) {
  const col = split === "sm" ? "sm:h-full sm:flex-col sm:items-start" : split === "md" ? "md:h-full md:flex-col md:items-start" : "";
  const first = split === "sm" ? "sm:order-first" : split === "md" ? "md:order-first" : "";
  return (
    <div className={`flex items-end justify-between gap-6 ${col}`}>
      <div className="min-w-0">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted">{kicker}</p>
        <p className="display mt-1 text-[2.6rem] italic leading-none sm:text-5xl" style={{ color }}>
          {word}
        </p>
        {detail && <div className="mt-2 text-sm text-soft">{detail}</div>}
      </div>
      {serial && <p className={`num shrink-0 text-xs tracking-[0.18em] text-faint ${first}`}>№ {serial}</p>}
    </div>
  );
}

/**
 * A group's own light, rising from a corner of the page. Fixed behind the
 * content (-z-10 inside the root stacking context), so it never tints text.
 */
export function HueGlow({ hue, at = "92% 104%", strength = 0.22 }: { hue: number; at?: string; strength?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ background: `radial-gradient(760px 460px at ${at}, oklch(0.6 0.16 ${hue} / ${strength}), transparent 70%)` }}
    />
  );
}

/** A group's monogram: its initial in the display italic on a tile of its hue, like the brand mark's "C". */
export function GroupMonogram({ name, hue, className = "size-14 rounded-2xl text-[2rem]" }: { name: string; hue: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center font-display italic leading-none text-ink-950 ${className}`}
      style={{
        background: `linear-gradient(135deg, oklch(0.86 0.12 ${hue}), oklch(0.66 0.16 ${(hue + 40) % 360}))`,
        boxShadow: `inset 0 1px 0 rgb(255 255 255 / .35), 0 12px 32px -14px oklch(0.7 0.17 ${hue})`,
      }}
    >
      <span className="-translate-x-[0.04em] translate-y-[0.02em]">{name.trim().slice(0, 1).toUpperCase()}</span>
    </span>
  );
}

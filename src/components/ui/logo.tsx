import { MARK } from "@/lib/icon-art";

/** Brand mark: an italic serif "C" with a gold full stop, on an iris tile. Flat, no gradients. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  const { tile, ink, stop, cTransform, cPath, ball, dot } = MARK;
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={`shrink-0 ${className}`}>
      <rect width="48" height="48" rx="12" fill={tile} />
      <g transform={cTransform} fill={ink}>
        <path d={cPath} />
        <circle {...ball} />
      </g>
      <circle {...dot} fill={stop} />
    </svg>
  );
}

/** Wordmark: "Called it." set in the display serif, with the mark's gold full stop. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="display text-[1.6rem] leading-none tracking-tight">
        Called <em className="font-display italic">it</em>
        <span className="text-gold">.</span>
      </span>
    </span>
  );
}

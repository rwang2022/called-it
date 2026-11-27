import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { smartQuotes } from "@/lib/ticket-art";

/** Headings are set in the display serif, where straight quotes look like typewriter marks. */
const typeset = (t: React.ReactNode) => (typeof t === "string" ? smartQuotes(t) : t);

export function SectionHeader({
  title,
  count,
  href,
  action,
}: {
  title: string;
  count?: number;
  href?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 mt-12 flex items-baseline gap-3 first:mt-0">
      <h2 className="display flex shrink-0 items-baseline gap-2 text-[1.6rem] leading-none">
        {typeset(title)}
        {count !== undefined && <span className="num text-xs font-medium tracking-normal text-faint">{count}</span>}
      </h2>
      {/* A ruled line out to the margin, like a section in a printed programme */}
      <span aria-hidden className="h-px min-w-6 flex-1 self-center bg-gradient-to-r from-white/[0.12] to-transparent" />
      {action}
      {href && (
        <Link href={href} className="flex items-center gap-0.5 text-sm text-muted transition-colors hover:text-fg">
          See all <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    // A blank slip: dashed edge, nothing written on it yet.
    <div className="flex flex-col items-center rounded-[20px] border border-dashed border-white/[0.13] bg-white/[0.015] px-6 py-12 text-center">
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03] text-muted">{icon}</div>}
      <h3 className="display text-[1.75rem] leading-tight">{typeset(title)}</h3>
      {children && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-8 animate-rise">
      {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
      <h1 className="display text-[2.7rem] leading-[1] sm:text-[3.4rem]">{typeset(title)}</h1>
      {children && <div className="mt-3 text-[0.98rem] text-muted">{children}</div>}
    </div>
  );
}

import Link from "next/link";
import { ChevronRight } from "lucide-react";

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
    <div className="mb-3 mt-10 flex items-end justify-between gap-3 first:mt-0">
      <h2 className="flex items-baseline gap-2 text-[1.05rem] font-semibold tracking-tight">
        {title}
        {count !== undefined && <span className="num text-sm font-medium text-faint">{count}</span>}
      </h2>
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
    <div className="surface flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-white/[0.05] text-muted">{icon}</div>}
      <h3 className="display text-2xl">{title}</h3>
      {children && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-8 animate-rise">
      {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
      <h1 className="display text-[2.6rem] leading-[1] sm:text-[3.2rem]">{title}</h1>
      {children && <div className="mt-3 text-[0.98rem] text-muted">{children}</div>}
    </div>
  );
}

/**
 * A row of figures ruled like a printed scorecard: one panel, hairline
 * columns, small-caps labels, and the figures set in the display serif.
 * Two columns on phones, four from `sm` up.
 */
export type ScoreItem = {
  label: string;
  value: string;
  sub?: string;
  tone?: "yes" | "no";
  icon?: React.ReactNode;
  /** Shown after the value (a flame for a hot streak). */
  mark?: React.ReactNode;
};

// Hairlines between cells: on phones a 2×2 grid, from `sm` one row.
const RULES = [
  "",
  "border-l",
  "border-t sm:border-l sm:border-t-0",
  "border-l border-t sm:border-t-0",
];

export function Scorecard({ items, className = "" }: { items: ScoreItem[]; className?: string }) {
  return (
    <dl className={`surface grid grid-cols-2 overflow-hidden sm:grid-cols-4 ${className}`}>
      {items.map((it, i) => (
        <div key={it.label} className={`min-w-0 border-white/[0.07] px-4 py-3.5 sm:px-5 sm:py-4 ${RULES[i] ?? ""}`}>
          <dt className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-muted">
            {it.icon}
            {it.label}
          </dt>
          <dd
            className={`display mt-1.5 flex items-center gap-1.5 text-[2.1rem] leading-none ${
              it.tone === "yes" ? "text-yes" : it.tone === "no" ? "text-no" : "text-fg"
            }`}
          >
            {it.value}
            {it.mark}
          </dd>
          {it.sub && <dd className="mt-1.5 truncate text-xs text-faint">{it.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

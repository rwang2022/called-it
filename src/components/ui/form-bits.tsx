"use client";

import { Check } from "lucide-react";
import { optionColor } from "../bet/palette";

/**
 * A form field heading that makes the to-do list obvious: a numbered step that
 * turns into a green check once it's filled in, and a "Required" tag until then.
 */
export function FieldLabel({
  n,
  done,
  required,
  htmlFor,
  aside,
  children,
}: {
  n?: number;
  done?: boolean;
  required?: boolean;
  htmlFor?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const Tag = htmlFor ? "label" : "p";
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <Tag {...(htmlFor ? { htmlFor } : {})} className="flex items-center gap-2 text-[0.92rem] font-semibold text-fg">
        {n !== undefined && (
          <span
            className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors ${
              done ? "bg-yes text-ink-950" : "bg-iris/20 text-iris ring-1 ring-iris/50"
            }`}
            aria-hidden
          >
            {done ? <Check className="size-3.5" strokeWidth={3.5} /> : n}
          </span>
        )}
        {children}
        {required && !done && (
          <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-gold">Required</span>
        )}
      </Tag>
      {aside}
    </div>
  );
}

/**
 * Yes/No or multiple-choice buttons that look like choices before you pick:
 * each shows its colour and an empty radio, and the chosen one fills in.
 */
export function SidePicker({
  kind,
  options,
  value,
  onChange,
  isBlocked,
  disabled,
}: {
  kind: string;
  options: { key: string | number; label: string }[];
  value: string | number | null;
  onChange: (key: string | number) => void;
  isBlocked?: (index: number) => boolean;
  disabled?: boolean;
}) {
  const nothingPicked = value === null || !options.some((o) => o.key === value);
  return (
    <div role="radiogroup" className={kind === "binary" ? "grid grid-cols-2 gap-2.5" : "grid grid-cols-[minmax(0,1fr)] gap-2"}>
      {options.map((o, i) => {
        const c = optionColor(kind, i);
        const on = o.key === value;
        const blocked = isBlocked?.(i) ?? false;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={blocked || disabled}
            onClick={() => onChange(o.key)}
            title={blocked ? "You can't bet against yourself" : undefined}
            className={`flex w-full min-w-0 items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-left font-semibold transition-all hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-30 ${
              kind === "binary" ? "min-h-16 text-lg" : "min-h-[52px]"
            }`}
            style={{
              borderColor: on ? c : `color-mix(in oklab, ${c} ${nothingPicked ? 45 : 22}%, transparent)`,
              background: `color-mix(in oklab, ${c} ${on ? 18 : 6}%, transparent)`,
              color: on ? c : `color-mix(in oklab, ${c} 70%, var(--color-fg))`,
              boxShadow: on ? `0 8px 30px -14px ${c}` : undefined,
            }}
          >
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full border-2"
              style={{ borderColor: c, background: on ? c : "transparent" }}
              aria-hidden
            >
              {on && <Check className="size-3 text-ink-950" strokeWidth={3.5} />}
            </span>
            {/* Long labels wrap rather than push the button past the card's edge. */}
            <span className="min-w-0 break-words leading-snug [overflow-wrap:anywhere]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

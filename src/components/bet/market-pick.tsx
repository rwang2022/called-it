"use client";

/** Fired when someone taps a side in the market; the pick form listens for it. */
export const PICK_EVENT = "calledit:pick";

/**
 * Makes a market row tappable: people reach for the big Yes/No rows first, so
 * tapping one picks that side in the form (which scrolls into view). A real
 * button laid over the row keeps the row's own markup valid and readable; the
 * row (a `group`) shows its hover cue from that.
 */
export function MarketPick({ optionId, label, mine }: { optionId: string; label: string; mine: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent<string>(PICK_EVENT, { detail: optionId }))}
      aria-label={mine ? `${label}, your pick. Change your position` : `Bet ${label}`}
      className="absolute inset-0 z-10 cursor-pointer rounded-2xl transition-colors hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/70"
    />
  );
}

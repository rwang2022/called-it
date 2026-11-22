"use client";

import { useSyncExternalStore } from "react";
import { shortDuration } from "@/lib/format";

/* One shared 1s clock for every countdown on the page. */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), 1000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const snapshot = () => Math.floor(Date.now() / 1000) * 1000;

/**
 * Live "3d 4h" countdown. Hydrates with the server's clock (no mismatch), then
 * ticks from the shared client clock.
 */
export function Countdown({
  to,
  serverNow,
  prefix = "",
  pastLabel = "now",
  className = "",
}: {
  to: number;
  serverNow: number;
  prefix?: string;
  pastLabel?: string;
  className?: string;
}) {
  const now = useSyncExternalStore(subscribe, snapshot, () => serverNow);
  const diff = to - now;
  return <span className={`num ${className}`}>{diff <= 0 ? pastLabel : `${prefix}${shortDuration(diff)}`}</span>;
}

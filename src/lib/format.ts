const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** $12 or $12.50 — cents only when they matter. */
export function money(cents: number) {
  const v = cents / 100;
  return cents % 100 === 0 ? usd0.format(v) : usd2.format(v);
}

/** +$12 / −$4.50 / $0 */
export function signedMoney(cents: number) {
  if (cents === 0) return "$0";
  return `${cents > 0 ? "+" : "−"}${money(Math.abs(cents))}`;
}

export const pct = (x: number, digits = 0) => {
  const v = Number((x * 100).toFixed(digits));
  return `${Object.is(v, -0) ? 0 : v.toFixed(digits)}%`;
};

/** +12% / −3% / 0% — never "−0%". */
export function signedPct(x: number) {
  const v = Math.round(x * 100);
  return v === 0 ? "0%" : `${v > 0 ? "+" : "−"}${Math.abs(v)}%`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3d 4h", "5h 12m", "42m", "now" */
export function shortDuration(ms: number) {
  const abs = Math.abs(ms);
  const m = Math.floor(abs / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 60) return `${Math.round(d / 30)}mo`;
  if (d >= 1) return `${d}d${h % 24 ? ` ${h % 24}h` : ""}`;
  if (h >= 1) return `${h}h${m % 60 ? ` ${m % 60}m` : ""}`;
  if (m >= 1) return `${m}m`;
  return "now";
}

export function relativeTime(target: number, now: number) {
  const diff = target - now;
  if (Math.abs(diff) < 60000) return "just now";
  return diff > 0 ? `in ${shortDuration(diff)}` : `${shortDuration(diff)} ago`;
}

export function formatDate(ts: number | Date, tz: string, opts: Intl.DateTimeFormatOptions = {}) {
  const d = typeof ts === "number" ? new Date(ts) : ts;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
    ...opts,
  }).format(d);
}

export function formatDateTime(ts: number | Date, tz: string) {
  return formatDate(ts, tz, { hour: "numeric", minute: "2-digit" });
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Parse "$12.50", "12", "12.5" into cents; null if invalid. */
export function parseDollars(input: string): number | null {
  const s = input.replace(/[$,\s]/g, "");
  if (!/^\d{1,6}(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/**
 * Shared art for the "wager slip" look of shared links: the generated preview
 * card (share-card.tsx) and the page a signed-out friend lands on both use it.
 * Pure functions, safe on the server or in images.
 */

/**
 * Appended to shared bet links as ?v=… . Chat apps cache a link's preview by
 * its exact URL, so bump this after changing the preview card and every link
 * shared from then on gets a freshly drawn card.
 */
export const SHARE_LINK_VERSION = "1";

/** Group hue → rgba(). Generated images can't use oklch, so the slip's colours come from here. */
export function hueRgba(h: number, s: number, l: number, alpha = 1) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `rgba(${f(0)}, ${f(8)}, ${f(4)}, ${alpha})`;
}

/**
 * A guilloche rosette, the interlaced spirograph line work printed on tickets
 * and banknotes: a few hypotrochoids of one family, drawn as hairlines.
 */
export function rosetteSvg(stroke: string) {
  const R = 120;
  const r = 45; // gcd 15 → 8 lobes; the curve closes after 3 turns
  const layers = [
    { d: 92, w: 0.9 },
    { d: 76, w: 0.8 },
    { d: 60, w: 0.7 },
    { d: 44, w: 0.6 },
  ];
  const paths = layers.map(({ d, w }) => {
    const pts: string[] = [];
    const steps = 1440;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2 * 3;
      const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
      const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
      pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return `<path d="M${pts.join("L")}" fill="none" stroke="${stroke}" stroke-width="${w}"/>`;
  });
  const ring = (rad: number, w: number) => `<circle r="${rad}" fill="none" stroke="${stroke}" stroke-width="${w}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-180 -180 360 360">${paths.join("")}${ring(172, 0.8)}${ring(176, 0.5)}</svg>`;
}

/** A ticket number that looks the part but reveals nothing about the link it belongs to. */
export function ticketNumber(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `${String(h % 10000).padStart(4, "0")}·${String((h >>> 16) % 100).padStart(2, "0")}`;
}

/** Typesetter's quotes: can't → can’t, "so" → “so”. */
export function smartQuotes(s: string) {
  return s
    .replace(/(^|[\s([{—–-])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s([{—–-])'/g, "$1‘")
    .replace(/'/g, "’");
}

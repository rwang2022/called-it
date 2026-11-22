/**
 * The brand mark: an italic high-contrast serif "C" with a gold full stop. "C." reads as "Called it."
 * Geometry is in a 48×48 box. The full stop sits on the baseline, clear of the C, so it reads as a
 * period and not a colon even in one color.
 */
export const MARK = {
  tile: "#8e7dff",
  ink: "#0b0d12",
  stop: "#fbbf24",
  /** Transform for the C (italic slant, optically centered with the stop). */
  cTransform: "translate(-1.8 0) skewX(-9) translate(4 0)",
  cPath: "M35.52 13.63A15.5 15.5 0 1 0 35.52 34.37L34.63 32.41A10.6 12.1 0 1 1 34.63 15.59Z",
  ball: { cx: 33.77, cy: 16.71, r: 3.6 },
  dot: { cx: 37.6, cy: 35.4, r: 3.4 },
} as const;

function markBody(fg: string, stop: string) {
  const { cTransform, cPath, ball, dot } = MARK;
  return `<g transform="${cTransform}" fill="${fg}"><path d="${cPath}"/><circle cx="${ball.cx}" cy="${ball.cy}" r="${ball.r}"/></g><circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${stop}"/>`;
}

/** The brand mark as a standalone SVG string (used for PNG icon generation). */
export function brandMarkSvg({ rounded, padding = 0 }: { rounded: boolean; padding?: number }) {
  const s = 48 + padding * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padding} ${-padding} ${s} ${s}">
<rect x="${-padding}" y="${-padding}" width="${s}" height="${s}" rx="${rounded ? 12 : 0}" fill="${MARK.tile}"/>
${markBody(MARK.ink, MARK.stop)}
</svg>`;
}

/** Monochrome notification badge (Android shows only its alpha channel): the "C." alone. */
export function badgeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 6 36 36">${markBody("#fff", "#fff")}</svg>`;
}

/**
 * Bump when the icon art changes. The PNG icon routes are cached as immutable, so the manifest and
 * service worker (public/sw.js) ask for `?v=ICON_VERSION` to make phones fetch the new art.
 */
export const ICON_VERSION = "2";

export const svgDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

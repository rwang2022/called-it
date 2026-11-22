import { ImageResponse } from "next/og";
import { badgeSvg, brandMarkSvg, svgDataUri } from "@/lib/icon-art";

const SIZES = new Set([192, 512]);
const BADGE = 96;

/**
 * PNG icons for the web app manifest (full-bleed with safe padding so they work
 * as maskable), plus `/pwa-icon/badge`: the monochrome notification badge.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = (await params).size;
  const badge = size === "badge";
  const n = badge ? BADGE : Number(size);
  if (!badge && !SIZES.has(n)) return new Response("Not found", { status: 404 });
  const svg = badge ? badgeSvg() : brandMarkSvg({ rounded: false, padding: 6 });
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={svgDataUri(svg)} width={n} height={n} alt="" />
    ),
    { width: n, height: n, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}

import { ImageResponse } from "next/og";
import { brandMarkSvg, svgDataUri } from "@/lib/icon-art";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={svgDataUri(brandMarkSvg({ rounded: false, padding: 4 }))} width={180} height={180} alt="" />
    ),
    size,
  );
}

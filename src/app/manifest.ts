import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/brand";
import { ICON_VERSION } from "@/lib/icon-art";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Bets and predictions between friends — with Claude at the table.",
    start_url: "/home",
    display: "standalone",
    background_color: "#06070a",
    theme_color: "#06070a",
    orientation: "portrait",
    icons: [
      { src: `/icon.svg?v=${ICON_VERSION}`, sizes: "any", type: "image/svg+xml" },
      { src: `/pwa-icon/192?v=${ICON_VERSION}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/pwa-icon/512?v=${ICON_VERSION}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

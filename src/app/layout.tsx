import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { TimezoneSync } from "@/components/timezone-sync";
import { Toaster } from "@/components/ui/toast";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — ${APP_TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: "Make bets and predictions with friends. Track who really sees the future — and play against Claude.",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#06070a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render every page per request, never as a prebuilt file: the CSP nonce that
  // lets Next's scripts run (see src/proxy.ts) is different on every request.
  await connection();
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrument.variable} antialiased`}>
      <body>
        <Toaster>
          <div className="relative z-10">{children}</div>
        </Toaster>
        <TimezoneSync />
      </body>
    </html>
  );
}

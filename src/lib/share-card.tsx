import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brandMarkSvg, svgDataUri } from "./icon-art";
import { hueRgba as hue, rosetteSvg, smartQuotes } from "./ticket-art";

export { ticketNumber } from "./ticket-art";

/**
 * The 1200×630 card chat apps show under a shared link, drawn as a wager slip:
 * the question set in the app's display serif on a ticket, a perforated stub
 * saying where the bet stands, guilloche "security printing" in the group's
 * colour, and the group's light glowing behind it all.
 *
 * Discord overlays an "ALT" badge on the image's bottom-left corner, so nothing
 * that matters lives there.
 */
export const CARD_SIZE = { width: 1200, height: 630 };

const INK = "#06070a";
const FG = "#eef0f5";
const SOFT = "#c4c9d6";
const MUTED = "#8b92a5";
const FAINT = "#5a6175";
const GOLD = "#fbbf24";
const LIVE = "#34d399";

let fonts: ReturnType<typeof loadFonts> | null = null;
async function loadFonts() {
  // Literal paths so the deploy bundler knows to ship these files.
  const [serif, serifItalic, sans] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/InstrumentSerif-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/InstrumentSerif-Italic.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Geist-Regular.ttf")),
  ]);
  return [
    { name: "Serif", data: serif, style: "normal" as const, weight: 400 as const },
    { name: "Serif", data: serifItalic, style: "italic" as const, weight: 400 as const },
    { name: "Sans", data: sans, style: "normal" as const, weight: 400 as const },
  ];
}

export type CardInput = {
  /** Small caps line above the headline, e.g. "A bet in The Group Chat". */
  eyebrow: string;
  hue: number;
  headline: string;
  /** Set after the headline in italic, e.g. a group's name. */
  emphasis?: string;
  /** A quiet line under the headline. */
  subline?: string;
  /** Hang a gold opening quote before the headline (for questions people "call"). */
  quote?: boolean;
  stub: {
    kicker: string;
    word: string;
    detail: string;
    tone: "live" | "settled" | "quiet";
  };
  /** Printed small on the stub like a ticket number. */
  serial: string;
  /** The stub's sign-off line. */
  cta: string;
};

const TICKET = { x: 44, y: 40, w: 1112, h: 550 };
const STUB_W = 300;
const NOTCH = 24;
const PAD_X = 72;

export async function shareCard(c: CardInput) {
  const headline = smartQuotes(c.headline);
  const text = headline + (c.emphasis ? ` ${c.emphasis}` : "");
  const size = text.length > 110 ? 54 : text.length > 80 ? 62 : text.length > 50 ? 72 : text.length > 28 ? 84 : 96;
  const toneColor = c.stub.tone === "live" ? LIVE : c.stub.tone === "settled" ? GOLD : SOFT;
  const dot = c.stub.tone === "live" ? LIVE : GOLD;
  const perforationX = TICKET.w - STUB_W;
  const rosette = svgDataUri(rosetteSvg(hue(c.hue, 0.75, 0.72)));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: INK,
          backgroundImage: [
            `radial-gradient(circle at 8% -6%, ${hue(258, 0.9, 0.62, 0.36)} 0%, transparent 44%)`,
            `radial-gradient(circle at 98% 106%, ${hue(c.hue, 0.85, 0.6, 0.42)} 0%, transparent 50%)`,
            `radial-gradient(circle at 62% 18%, rgba(92, 203, 255, 0.06) 0%, transparent 38%)`,
          ].join(", "),
          fontFamily: "Sans",
          color: FG,
        }}
      >
        {/* The ticket */}
        <div
          style={{
            position: "absolute",
            left: TICKET.x,
            top: TICKET.y,
            width: TICKET.w,
            height: TICKET.h,
            display: "flex",
            borderRadius: 30,
            border: "1.5px solid rgba(255, 255, 255, 0.11)",
            backgroundImage: "linear-gradient(162deg, rgba(29, 33, 46, 0.95) 0%, rgba(16, 18, 26, 0.96) 52%, rgba(10, 11, 16, 0.97) 100%)",
            boxShadow: "0 40px 90px rgba(0, 0, 0, 0.55)",
            overflow: "hidden",
          }}
        >
          {/* A sheen along the top edge, like light catching card stock */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: TICKET.w,
              height: 1,
              backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 30%, rgba(255,255,255,0.06) 70%, transparent 100%)",
            }}
          />

          {/* Main panel */}
          <div style={{ display: "flex", flexDirection: "column", width: perforationX, padding: `50px ${PAD_X - 8}px 54px ${PAD_X}px` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={svgDataUri(brandMarkSvg({ rounded: true }))} width={40} height={40} alt="" />
              <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Serif", fontSize: 36, letterSpacing: -0.5 }}>
                Called&nbsp;<span style={{ fontStyle: "italic" }}>it</span>
                <span style={{ color: GOLD }}>.</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1 }}>
              <div style={{ display: "flex", fontSize: 19, letterSpacing: 4.5, textTransform: "uppercase", color: hue(c.hue, 0.8, 0.78) }}>
                {c.eyebrow}
              </div>
              <div style={{ display: "flex", position: "relative", marginTop: 20 }}>
                {c.quote && (
                  <div
                    style={{
                      position: "absolute",
                      left: -Math.round(size * 0.52),
                      top: -Math.round(size * 0.1),
                      fontFamily: "Serif",
                      fontSize: Math.round(size * 1.3),
                      lineHeight: 1,
                      color: GOLD,
                    }}
                  >
                    “
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Serif", fontSize: size, lineHeight: 1.08, letterSpacing: -1, color: FG }}>
                  {headline}
                  {c.emphasis && (
                    <span style={{ fontStyle: "italic", color: hue(c.hue, 0.75, 0.84), marginLeft: Math.round(size * 0.24) }}>{c.emphasis}</span>
                  )}
                </div>
              </div>
              {c.subline && <div style={{ display: "flex", marginTop: 22, fontSize: 25, lineHeight: 1.35, color: MUTED }}>{c.subline}</div>}
            </div>
          </div>

          {/* Perforation: a column of punched holes */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", width: 4, padding: "42px 0" }}>
            {Array.from({ length: 21 }, (_, i) => (
              <div key={i} style={{ width: 4, height: 4, borderRadius: 4, background: "rgba(255, 255, 255, 0.17)" }} />
            ))}
          </div>

          {/* Stub */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              position: "relative",
              overflow: "hidden",
              width: STUB_W - 4,
              padding: "50px 40px 48px 44px",
              backgroundImage: `linear-gradient(180deg, ${hue(c.hue, 0.7, 0.6, 0.05)} 0%, ${hue(c.hue, 0.8, 0.6, 0.15)} 100%)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={rosette}
              width={430}
              height={430}
              alt=""
              style={{ position: "absolute", left: 92, top: 150, opacity: 0.2 }}
            />
            <div style={{ display: "flex", fontSize: 17, letterSpacing: 4, color: FAINT }}>№ {c.serial}</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 17, letterSpacing: 4.5, textTransform: "uppercase", color: MUTED }}>{c.stub.kicker}</div>
              <div
                style={{
                  display: "flex",
                  marginTop: 8,
                  fontFamily: "Serif",
                  fontStyle: "italic",
                  fontSize: c.stub.word.length > 8 ? 52 : 68,
                  lineHeight: 1.05,
                  color: toneColor,
                }}
              >
                {c.stub.word}
              </div>
              <div style={{ display: "flex", marginTop: 12, fontSize: 23, lineHeight: 1.3, color: SOFT }}>{c.stub.detail}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 19, color: MUTED }}>
              <div style={{ width: 11, height: 11, borderRadius: 11, background: dot, boxShadow: `0 0 16px ${dot}` }} />
              {c.cta}
            </div>
          </div>

          {/* Notches where the perforation meets the edges (the ticket clips them to half-circles) */}
          {[-NOTCH, TICKET.h - NOTCH].map((top) => (
            <div
              key={top}
              style={{
                position: "absolute",
                left: perforationX + 2 - NOTCH,
                top,
                width: NOTCH * 2,
                height: NOTCH * 2,
                borderRadius: NOTCH * 2,
                background: INK,
                border: "1.5px solid rgba(255, 255, 255, 0.11)",
              }}
            />
          ))}
        </div>
      </div>
    ),
    {
      ...CARD_SIZE,
      fonts: await (fonts ??= loadFonts()),
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    },
  );
}

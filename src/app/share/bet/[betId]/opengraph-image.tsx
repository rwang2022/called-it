import { betTeaser } from "@/lib/data/share";
import { CARD_SIZE, shareCard, ticketNumber } from "@/lib/share-card";

/** The card under a shared bet link: the question as a wager slip, its stub saying where the bet stands. */
export const alt = "A bet on Called It";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ betId: string }> }) {
  const t = await betTeaser((await params).betId);
  if (!t) {
    return shareCard({
      eyebrow: "Bets between friends",
      hue: 268,
      headline: "Make the call. Keep the receipts.",
      stub: { kicker: "Called it", word: "Soon", detail: "friends, odds and bragging rights", tone: "settled" },
      serial: ticketNumber("called-it"),
      cta: "Make your call",
    });
  }
  return shareCard({
    eyebrow: `A bet in ${t.groupName}`,
    hue: t.groupHue,
    headline: t.title,
    quote: true,
    stub: { kicker: "Betting", word: t.label, detail: t.detail, tone: t.tone },
    serial: ticketNumber(t.id),
    cta: t.open ? "Make your call" : "See how it went",
  });
}

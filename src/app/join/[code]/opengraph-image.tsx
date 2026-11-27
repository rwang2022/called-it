import { inviteTeaser } from "@/lib/data/share";
import { CARD_SIZE, shareCard, ticketNumber } from "@/lib/share-card";

/** The card under a shared invite link: an admission ticket to the group. */
export const alt = "An invite to a group on Called It";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const g = await inviteTeaser((await params).code);
  return shareCard({
    eyebrow: "You're invited",
    hue: g?.hue ?? 268,
    headline: g ? "Join" : "Bets between",
    emphasis: g ? g.name : "friends",
    subline: "Bets and predictions between friends, with honest track records and Claude at the table.",
    stub: g
      ? { kicker: "Admits one", word: String(g.members), detail: g.members === 1 ? "member so far" : "members calling it", tone: "settled" }
      : { kicker: "Admits one", word: "You", detail: "and your friends", tone: "settled" },
    // Never the invite code itself: it lets people join, and screenshots travel.
    serial: ticketNumber(g?.code ?? "called-it"),
    cta: "Bring your hunches",
  });
}

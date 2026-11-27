import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { betTeaser } from "@/lib/data/share";
import { appUrl, devLoginEnabled, googleConfigured } from "@/lib/auth/current";
import { svgDataUri } from "@/lib/icon-art";
import { hueRgba, rosetteSvg, smartQuotes, ticketNumber } from "@/lib/ticket-art";
import { Logo } from "@/components/ui/logo";
import { GoogleG } from "@/components/auth/google-g";
import { APP_NAME } from "@/lib/brand";

/**
 * What a signed-out visitor (or a link-preview bot like Discord's) sees at
 * /bets/<id>: the proxy rewrites them here, so shared links unfurl with the
 * question and a friend who signs in lands straight on the bet. Drawn as the
 * same wager slip as the preview card. Only the teaser's fields are shown; the
 * bet itself stays members-only.
 */
type Props = { params: Promise<{ betId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await betTeaser((await params).betId);
  if (!t) return { title: "Bet", robots: { index: false } };
  const description = `A bet in ${t.groupName} · ${t.status}`;
  return {
    metadataBase: new URL(appUrl()),
    title: { absolute: t.title },
    description,
    // Search engines are kept off these paths by robots.txt (src/app/robots.ts),
    // which explicitly lets link-preview bots through.
    openGraph: { title: t.title, description, siteName: APP_NAME, type: "website", url: `/bets/${t.id}` },
    twitter: { card: "summary_large_image", title: t.title, description },
  };
}

const TONE = { live: "text-yes", settled: "text-gold", quiet: "text-soft" } as const;

export default async function BetTeaserPage({ params }: Props) {
  const t = await betTeaser((await params).betId);
  if (!t) notFound();
  const next = encodeURIComponent(`/bets/${t.id}`);
  const h = t.groupHue;
  const rosette = svgDataUri(rosetteSvg(hueRgba(h, 0.75, 0.72)));
  // Half-circle bites where the perforation meets the ticket's edge (the ticket clips the outer half).
  const notch = "absolute size-7 rounded-full border border-white/[0.1] bg-ink-950";

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12 sm:py-16">
      {/* The group's own light, rising from the corner */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{ background: `radial-gradient(760px 460px at 92% 104%, oklch(0.6 0.16 ${h} / 0.26), transparent 70%)` }}
      />

      <Link href="/" className="relative mb-10 animate-fade">
        <Logo />
      </Link>

      <article
        className="relative grid w-full max-w-[760px] animate-rise overflow-hidden rounded-[28px] border border-white/[0.1] shadow-[0_40px_90px_-30px_rgb(0_0_0/0.75)] sm:grid-cols-[1fr_auto]"
        style={{ backgroundImage: "linear-gradient(162deg, rgb(29 33 46 / 0.94), rgb(16 18 26 / 0.95) 52%, rgb(10 11 16 / 0.97))" }}
      >
        {/* Light catching the top edge of the card stock */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        <div className="px-8 pb-9 pt-9 sm:px-11 sm:pb-12 sm:pt-11">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em]" style={{ color: `oklch(0.82 0.1 ${h})` }}>
            A bet in {t.groupName}
          </p>
          <h1 className="display relative mt-4 text-[2.35rem] leading-[1.06] sm:text-[3rem]">
            <span aria-hidden className="absolute -left-[0.48em] -top-[0.06em] text-gold">
              “
            </span>
            {smartQuotes(t.title)}
          </h1>
        </div>

        {/* Stub, behind a perforation: below the question on phones, beside it on wider screens */}
        <aside
          className="relative border-t-2 border-dashed border-white/[0.14] px-8 py-7 sm:w-[230px] sm:border-l-2 sm:border-t-0 sm:px-9 sm:py-11"
          style={{ backgroundImage: `linear-gradient(180deg, oklch(0.6 0.12 ${h} / 0.05), oklch(0.6 0.14 ${h} / 0.15))` }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={rosette} alt="" className="absolute -right-28 top-2 w-[320px] max-w-none opacity-[0.18] sm:-right-36 sm:top-24" />
          </div>
          <span aria-hidden className={`${notch} -left-3.5 -top-3.5`} />
          <span aria-hidden className={`${notch} -right-3.5 -top-3.5 sm:right-auto sm:top-auto sm:-bottom-3.5 sm:-left-3.5`} />

          <div className="relative flex items-end justify-between gap-6 sm:h-full sm:flex-col sm:items-start">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted">Betting</p>
              <p className={`display mt-1 text-[2.6rem] italic leading-none sm:text-5xl ${TONE[t.tone]}`}>{t.label}</p>
              <p className="mt-2 text-sm text-soft">{t.detail}</p>
            </div>
            <p className="num shrink-0 text-xs tracking-[0.18em] text-faint sm:order-first">№ {ticketNumber(t.id)}</p>
          </div>
        </aside>
      </article>

      <div className="relative mt-9 w-full max-w-[400px] animate-rise space-y-3 [animation-delay:120ms]">
        {googleConfigured() && (
          <a href={`/api/auth/google?next=${next}`} className="btn btn-light btn-lg w-full gap-3">
            <GoogleG /> {t.open ? "Sign in to make your pick" : "Sign in to see how it went"}
          </a>
        )}
        <Link href={`/signin?next=${next}`} className="btn btn-ghost btn-lg w-full">
          {googleConfigured() ? "Use a username" : "Sign in with a username"}
        </Link>
        {devLoginEnabled() && (
          <a href={`/?next=${next}`} className="block text-center text-sm text-muted hover:text-fg">
            Use a demo account (dev)
          </a>
        )}
        <p className="hint flex items-start justify-center gap-1.5 pt-3 text-center">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          <span>Picks and comments stay between members of {t.groupName}. Not in it yet? Ask for the group&apos;s invite link.</span>
        </p>
      </div>
    </div>
  );
}

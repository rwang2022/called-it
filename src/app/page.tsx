import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import { getCurrentUser, devLoginEnabled, googleConfigured } from "@/lib/auth/current";
import { safeNext } from "@/lib/auth/session";
import { Logo } from "@/components/ui/logo";
import { ClaudeGlyph } from "@/components/ui/avatar";
import { APP_NAME } from "@/lib/brand";
import { GoogleG } from "@/components/auth/google-g";

const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see SETUP.md).",
  oauth_state: "Your sign-in session expired. Please try again.",
  oauth_exchange: "Google didn't accept the sign-in. Please try again.",
  oauth_claims: "We couldn't verify your Google account. Please try again.",
  email_unverified: "Your Google account's email isn't verified.",
};

const DEV_USERS = [
  ["dev_alex", "Alex"],
  ["dev_sam", "Sam"],
  ["dev_jo", "Jo"],
  ["dev_priya", "Priya"],
  ["dev_ben", "Ben"],
  ["dev_maya", "Maya"],
];

export default async function Landing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const user = await getCurrentUser();
  if (user) redirect(next);
  const error = sp.error ? (ERRORS[sp.error] ?? "Something went wrong signing in.") : null;
  const googleHref = `/api/auth/google?next=${encodeURIComponent(next)}`;
  const signinHref = `/signin?next=${encodeURIComponent(next)}`;

  return (
    <div className="relative overflow-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <Link href={signinHref} className="btn btn-ghost btn-sm">
          Sign in
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div className="animate-rise">
          <span className="chip mb-6 gap-2 border-claude/30 bg-claude/10 text-[#f3b79f]">
            <span className="inline-block size-3.5 shrink-0"><ClaudeGlyph /></span>
            Now with Claude at the table
          </span>
          <h1 className="display text-[3.4rem] leading-[0.95] sm:text-[4.6rem] lg:text-[5.4rem]">
            Friendly bets.
            <br />
            <em className="text-gradient">Brutally honest</em>
            <br />
            track records.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-soft">
            Bet your friends on anything — pull-ups, stock prices, elections, dares. {APP_NAME} keeps the
            ledger, keeps the judging fair, and scores everyone like real forecasters. So you&apos;ll finally know
            who actually sees the future.
          </p>

          {error && (
            <p role="alert" className="mt-6 max-w-md rounded-2xl border border-no/30 bg-no/10 px-4 py-3 text-sm text-[#fecdd3]">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a href={googleHref} className="btn btn-light btn-lg gap-3" aria-disabled={!googleConfigured() && !devLoginEnabled()}>
              <GoogleG /> Continue with Google
            </a>
            <Link href={`${signinHref}&mode=signup`} className="btn btn-ghost btn-lg">
              Use a username
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">Free. Invite-only groups. No real money moves here.</p>

          {devLoginEnabled() && (
            <div className="mt-7 max-w-md rounded-2xl border border-dashed border-white/15 p-4">
              <p className="eyebrow mb-3">Local dev · sign in as a demo friend</p>
              <div className="flex flex-wrap gap-2">
                {DEV_USERS.map(([id, name]) => (
                  <a key={id} href={`/api/auth/dev?user=${id}&next=${encodeURIComponent(next)}`} className="btn btn-ghost btn-sm">
                    {name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <HeroCards />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
        <div className="mb-12 max-w-2xl">
          <p className="eyebrow mb-4">The house rules</p>
          <h2 className="display text-4xl leading-[1.05] sm:text-5xl">
            A group chat argument, <em>with a referee.</em>
          </h2>
        </div>
        <ol className="grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          <Feature n={1} title="Any kind of bet">
            Yes or no, multiple choice, or a head-to-head challenge: &ldquo;you do 50 push-ups, I run a sub-25
            5K, loser pays.&rdquo; As many people on each side as you like.
          </Feature>
          <Feature n={2} title="Fair by design">
            Neutral judges, a 24-hour review window, and majority-vote disputes. Nobody bets against
            themselves, and terms lock once others join.
          </Feature>
          <Feature n={3} title="Scored like forecasters">
            Every pick carries a confidence, graded with Brier scores and broken down by category. Luck
            washes out; skill shows.
          </Feature>
          <Feature n={4} title="Claude plays too" claude>
            On public events Claude researches the web and locks in a sealed pick, revealed when betting
            closes. Beat it if you can.
          </Feature>
          <Feature n={5} title="An oracle for public facts" claude>
            Stock closes, election results, final scores. Claude looks up the outcome and makes the call,
            with sources. You can still dispute it.
          </Feature>
          <Feature n={6} title="Settle up in one tap">
            Money bets roll into a group ledger that works out the fewest payments. Receivers confirm, so
            nobody fudges the books.
          </Feature>
        </ol>
        <div className="mt-24 flex flex-col items-center gap-4 text-center">
          <h2 className="display text-4xl sm:text-5xl">
            Stop saying <em className="text-gradient">&ldquo;I called it.&rdquo;</em> Prove it.
          </h2>
          <a href={googleHref} className="btn btn-primary btn-lg">
            Start a group <ArrowRight className="size-4" />
          </a>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-faint">
        {APP_NAME} is a scoreboard and IOU tracker for friends. It never holds or moves money. Bet responsibly.
        <span className="mx-2">·</span>
        <Link href="/how-it-works" className="hover:text-muted">How it works</Link>
        <span className="mx-2">·</span>
        <Link href="/privacy" className="hover:text-muted">Privacy</Link>
      </footer>
    </div>
  );
}

function Feature({ n, title, claude, children }: { n: number; title: string; claude?: boolean; children: React.ReactNode }) {
  return (
    <li className="border-t border-white/10 pt-5">
      <div className="mb-5 flex items-center justify-between">
        <span className="num text-xs tracking-widest text-faint">{String(n).padStart(2, "0")}</span>
        {claude && (
          <span className="flex items-center gap-1.5 text-xs text-[#f3b79f]">
            <span className="inline-block size-3"><ClaudeGlyph /></span>
            Claude
          </span>
        )}
      </div>
      <h3 className="display mb-3 text-[1.7rem] leading-tight">{title}</h3>
      <p className="max-w-[34ch] text-[0.95rem] leading-relaxed text-muted">{children}</p>
    </li>
  );
}

function HeroCards() {
  return (
    <div className="relative mx-auto h-[460px] w-full max-w-[460px] sm:h-[520px]" aria-hidden>
      <div className="absolute -inset-10 rounded-full bg-iris/20 blur-3xl" />
      {/* Card 1: yes/no */}
      <div className="surface absolute left-0 top-4 w-[86%] animate-float bg-ink-850/90 p-5 backdrop-blur-xl" style={{ ["--tilt" as string]: "-3deg" }}>
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="font-medium text-muted">Fitness · by Alex</span>
          <span className="chip text-yes" style={{ borderColor: "rgb(52 211 153 / .25)", background: "rgb(52 211 153 / .08)" }}>
            <span className="size-1.5 rounded-full bg-yes" /> Open · 9d
          </span>
        </div>
        <p className="display mb-4 text-[1.6rem] leading-[1.1]">Will Sam do 10 unbroken pull-ups by New Year&apos;s?</p>
        <div className="mb-1.5 flex justify-between text-sm font-semibold">
          <span className="text-yes">Yes 38%</span>
          <span className="text-no">62% No</span>
        </div>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          <div className="w-[38%] rounded-l-full bg-gradient-to-r from-emerald-600 to-yes" />
          <div className="flex-1 rounded-r-full bg-gradient-to-r from-no to-rose-600" />
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-soft">
          <Faces /> <span className="num">$115</span> <span className="text-muted">pot</span>
        </div>
      </div>
      {/* Card 2: Claude sealed */}
      <div
        className="surface absolute right-0 top-[52%] w-[64%] animate-float bg-ink-850/90 p-4 backdrop-blur-xl [animation-delay:-2.5s]"
        style={{ ["--tilt" as string]: "4deg" }}
      >
        <div className="flex items-center gap-3">
          <span className="inline-block size-9 shrink-0"><ClaudeGlyph /></span>
          <div>
            <p className="text-sm font-semibold">Claude locked in a pick</p>
            <p className="flex items-center gap-1 text-xs text-muted">
              <Lock className="size-3" /> Sealed until betting closes
            </p>
          </div>
        </div>
      </div>
      {/* Card 3: leaderboard */}
      <div
        className="surface absolute bottom-0 left-[6%] w-[60%] animate-float bg-ink-850/90 p-4 backdrop-blur-xl [animation-delay:-4.5s]"
        style={{ ["--tilt" as string]: "-2deg" }}
      >
        <p className="eyebrow mb-3">Forecast skill</p>
        {[
          ["Priya", 0.41, "#fbbf24"],
          ["Claude", 0.33, "#e8845f"],
          ["Sam", 0.18, "#a5b4fc"],
        ].map(([n, v, c], i) => (
          <div key={n as string} className="mb-2 flex items-center gap-2.5 text-sm last:mb-0">
            <span className="num w-3 text-faint">{i + 1}</span>
            <span className="w-14 font-medium">{n as string}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${(v as number) * 220}%`, background: c as string }} />
            </div>
            <span className="num w-9 text-right text-xs text-muted">+{Math.round((v as number) * 100)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Faces() {
  const hues = [268, 150, 25, 210];
  return (
    <span className="flex">
      {hues.map((h, i) => (
        <span
          key={h}
          className={`size-6 rounded-full ring-2 ring-ink-850 ${i ? "-ml-2" : ""}`}
          style={{ background: `linear-gradient(135deg, oklch(0.7 0.15 ${h}), oklch(0.5 0.17 ${h + 40}))` }}
        />
      ))}
    </span>
  );
}

import Link from "next/link";
import { BadgeCheck, Ban, Gavel, Lock, Scale, Swords, Target, Vote, Wallet } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ClaudeGlyph } from "@/components/ui/avatar";
import { APP_NAME } from "@/lib/brand";

export const metadata = { title: "How it works", description: `The rules of ${APP_NAME}: payouts, judging, disputes and scoring.` };

const RULES: { icon: React.ReactNode; title: string; body: React.ReactNode }[] = [
  {
    icon: <Wallet className="size-5" />,
    title: "Payouts: split the pot, at fair odds",
    body: (
      <>
        Everyone on the winning side splits the losing side&apos;s pot in proportion to what they staked, but nobody can win more than
        fair odds allow: your own stake on a yes/no bet, or up to (options − 1)× your stake on multiple choice. So $1 against
        someone&apos;s $10 wins $1, not $10, and the losing money nobody could claim goes back to whoever staked it. If nobody took the
        other side, everyone gets their stake back.
      </>
    ),
  },
  {
    icon: <Swords className="size-5" />,
    title: "Challenges: whoever fails, pays",
    body: (
      <>
        Each person commits to their own task at the same stake. If everyone succeeds, or nobody does, no money moves. Otherwise each
        person who fails pays their stake, split among those who succeeded. Nobody is entered into a challenge without accepting it.
      </>
    ),
  },
  {
    icon: <Lock className="size-5" />,
    title: "Betting closes before the answer is knowable",
    body: (
      <>
        Every bet has a close time and a result date. Positions can be changed or withdrawn until betting closes, then they lock. A judge
        can call a bet early (say Sam does the pull-up in March) — that closes betting immediately.
      </>
    ),
  },
  {
    icon: <Gavel className="size-5" />,
    title: "Judges call it, everyone can check",
    body: (
      <>
        The judge is the creator, a neutral friend (who can&apos;t bet on it), or Claude for public events. After a call, participants have
        24 hours to confirm or dispute. If everyone confirms, it settles right away; if no one disputes, it settles when the window ends.
      </>
    ),
  },
  {
    icon: <Vote className="size-5" />,
    title: "Disputes go to a vote",
    body: (
      <>
        A dispute opens a 48-hour vote among participants (not the judge): uphold the call, or void the bet and refund everyone. A strict
        majority ends it early. When time runs out, uphold needs more votes than void — ties void. The judge can also revise the call,
        which restarts the review.
      </>
    ),
  },
  {
    icon: <Scale className="size-5" />,
    title: "No sandbagging",
    body: (
      <>
        If a bet is about you (&ldquo;Will Sam do a pull-up?&rdquo;), you can only bet on yourself to succeed, and you can&apos;t judge it.
        Betting against yourself would be an incentive to fail.
      </>
    ),
  },
  {
    icon: <Target className="size-5" />,
    title: "Scored like forecasters",
    body: (
      <>
        Every pick carries your confidence, graded with the Brier score (the squared gap between your confidence and what happened). Your{" "}
        <b>edge</b> is how much better that was than everyone else&apos;s on the same bet, Claude included. Calling a sure thing earns
        nothing, because everyone else called it too; you score by knowing something the room didn&apos;t. Points only move between the
        people on a bet, so nobody can farm them. Fewer than three rated calls is provisional.
      </>
    ),
  },
  {
    icon: <BadgeCheck className="size-5" />,
    title: "Only rated bets count",
    body: (
      <>
        A bet counts toward scores when at least two people forecast it and betting stayed open for an hour. If the judge also bet and
        called it their own way, their side only counts once someone on another side confirms or a dispute vote upholds it; everyone
        else&apos;s picks still count, because they had 24 hours to dispute. People who join an established group sit out of scoring for
        their first week. Anything that doesn&apos;t count is <b>unrated</b>: the money still settles, it just doesn&apos;t touch
        anyone&apos;s record. Open bets show a live &ldquo;Will this count?&rdquo; checklist, and settled ones show which it was, and why.
      </>
    ),
  },
  {
    icon: <Ban className="size-5" />,
    title: "No real money moves here",
    body: (
      <>
        {APP_NAME} is a scoreboard and IOU ledger. Money bets roll into each group&apos;s balance sheet, which works out the fewest payments
        to settle up. Pay each other however you like; a payment counts once the receiver confirms it.
      </>
    ),
  },
];

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="mb-12 inline-block">
        <Logo />
      </Link>
      <h1 className="display text-5xl sm:text-6xl">
        House <em className="text-gradient">rules</em>
      </h1>
      <p className="mt-4 max-w-xl text-lg text-soft">Simple enough to explain at dinner, strict enough that nobody can weasel out of a bet.</p>

      <div className="mt-12 grid gap-4">
        {RULES.map((r, i) => (
          <section key={r.title} className="surface flex animate-rise gap-4 p-5 sm:p-6" style={{ animationDelay: `${i * 50}ms` }}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-iris/12 text-iris">{r.icon}</span>
            <div>
              <h2 className="mb-1.5 text-[1.05rem] font-semibold">{r.title}</h2>
              <p className="text-[0.95rem] leading-relaxed text-muted [&_b]:text-fg">{r.body}</p>
            </div>
          </section>
        ))}
        <section className="surface flex gap-4 p-5 sm:p-6" style={{ borderColor: "color-mix(in oklab, var(--color-claude) 25%, transparent)" }}>
          <span className="inline-block size-10 shrink-0">
            <ClaudeGlyph />
          </span>
          <div>
            <h2 className="mb-1.5 text-[1.05rem] font-semibold">Claude at the table</h2>
            <p className="text-[0.95rem] leading-relaxed text-muted">
              On bets about public events, Claude researches the web and locks in a sealed pick when the bet is posted — revealed only
              once betting closes, so nobody can copy it. It plays for bragging rights (never money) and shows up on the leaderboard, so
              you can see who actually beats the machine. It can also act as the oracle: when the bet comes due it looks up the result,
              cites its sources, and makes the call — which you can dispute like any other.
            </p>
          </div>
        </section>
      </div>
      <div className="mt-12 text-center">
        <Link href="/home" className="btn btn-primary btn-lg">
          Make a bet
        </Link>
      </div>
    </div>
  );
}

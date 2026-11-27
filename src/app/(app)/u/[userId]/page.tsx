import { edgePoints } from "@/lib/engine/rating";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Flame, Swords, Target, TrendingUp, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { googleConfigured, requireUser } from "@/lib/auth/current";
import { myGroupIds } from "@/lib/data/common";
import { betsInvolving } from "@/lib/data/bets";
import { profileStats } from "@/lib/data/stats";
import { categoryOf } from "@/lib/categories";
import { CLAUDE_ID } from "@/lib/engine/rules";
import { MIN_GRADED } from "@/lib/engine/scoring";
import { viewerTimeZone } from "@/lib/tz";
import { firstName, pct, signedMoney, signedPct } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { BetCard } from "@/components/bet/bet-card";
import { CalibrationChart, CategoryBars, PnlChart } from "@/components/charts";
import { EmptyState, SectionHeader } from "@/components/ui/section";
import { Scorecard } from "@/components/ui/scorecard";
import { requestNow } from "@/lib/now";
import { vapidPublicKey } from "@/lib/notify";
import { NotificationSettings } from "@/components/push/notification-settings";
import { SignInMethods } from "@/components/auth/sign-in-methods";
import { ProfileEditor } from "@/components/profile/profile-editor";

type Props = { params: Promise<{ userId: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function load(userId: string) {
  const viewer = await requireUser();
  const target = await db.select({ id: users.id, name: users.name, image: users.image, isBot: users.isBot, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).get();
  if (!target) notFound();
  const mine = await myGroupIds(viewer.id);
  // Privacy: you only see someone's record from groups you share.
  const shared = target.id === CLAUDE_ID || target.id === viewer.id ? mine : (await myGroupIds(target.id)).filter((g) => mine.includes(g));
  if (shared.length === 0 && target.id !== viewer.id) notFound();
  return { viewer, target, shared };
}

export async function generateMetadata({ params }: Props) {
  const { userId } = await params;
  const { target } = await load(userId);
  return { title: target.isBot ? "Claude" : target.name };
}

const LINK_ERRORS: Record<string, string> = {
  google_in_use: "That Google account already belongs to another Called It account, so it wasn't connected.",
  reauth: "For security, sign out and back in, then connect Google within 15 minutes.",
};

async function signInInfo(userId: string) {
  const row = await db
    .select({ username: users.username, hash: users.passwordHash, googleSub: users.googleSub })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return { username: row?.username ?? null, hasPassword: Boolean(row?.hash), hasGoogle: Boolean(row?.googleSub) };
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { userId } = await params;
  const sp = await searchParams;
  const { viewer, target, shared } = await load(userId);
  const [p, history, tz] = await Promise.all([profileStats(target.id, shared), betsInvolving(target.id, shared, viewer.id), viewerTimeZone()]);
  const s = p.stats;
  const now = requestNow();
  const isMe = target.id === viewer.id;
  const isBot = target.isBot;
  const nemesis = p.headToHead.filter((h) => h.losses > h.wins).sort((a, b) => b.losses - b.wins - (a.losses - a.wins))[0];
  const victim = p.headToHead.filter((h) => h.wins > h.losses).sort((a, b) => b.wins - b.losses - (a.wins - a.losses))[0];
  const calibrationRead =
    s.n < MIN_GRADED
      ? "Make a few more calls to see your calibration."
      : (() => {
          const filled = s.calibration.filter((b) => b.n > 0);
          const over = filled.reduce((a, b) => a + (b.predicted - b.actual) * b.n, 0) / Math.max(1, s.n);
          if (Math.abs(over) < 0.06) return "Well calibrated — when you say 70%, it happens about 70% of the time.";
          return over > 0
            ? `Overconfident by ~${Math.round(over * 100)} points. Your sure things aren't as sure as you think.`
            : `Underconfident by ~${Math.round(-over * 100)} points. Trust your gut more.`;
        })();

  return (
    <div>
      <header className="mb-8 flex animate-rise flex-col items-start gap-5 sm:flex-row sm:items-center">
        <Avatar user={target} size="2xl" className="shadow-2xl shadow-iris/20 ring-4 ring-white/10 ring-offset-4 ring-offset-ink-950" />
        <div>
          <p className="eyebrow mb-2">{isBot ? "AI forecaster" : isMe ? "Your record" : "Forecaster"}</p>
          <h1 className="display text-[2.9rem] leading-none sm:text-[3.6rem]">
            {isBot ? "Claude" : target.name}
            <span className="text-gold">.</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
            {isBot
              ? "Researches public events and locks in sealed picks. Plays for bragging rights only."
              : `${s.n} rated ${s.n === 1 ? "call" : "calls"}${s.provisional ? " · provisional" : ""}${s.unrated ? ` · ${s.unrated} unrated` : ""}`}
          </p>
        </div>
      </header>

      <Scorecard
        items={[
          {
            label: "Edge",
            value: edgePoints(s.edge),
            sub: s.edge === null ? "no rated calls yet" : `pts vs the room · Brier ${s.brier!.toFixed(3)}`,
            icon: <Target className="size-3.5" />,
          },
          { label: "Record", value: s.n ? `${s.wins}–${s.losses}` : "—", sub: s.n ? `${pct(s.winRate)} hit rate` : "no calls yet", icon: <Zap className="size-3.5" /> },
          !isBot
            ? {
                label: "Net winnings",
                value: s.stakedCents ? signedMoney(s.netCents) : "—",
                sub: s.roi === null ? "no money bets" : `${signedPct(s.roi)} ROI`,
                tone: s.netCents > 0 ? "yes" : s.netCents < 0 ? "no" : undefined,
                icon: <TrendingUp className="size-3.5" />,
              }
            : { label: "Upsets", value: String(s.upsets), sub: "wins against the crowd", icon: <TrendingUp className="size-3.5" /> },
          {
            label: isBot ? "Best streak" : "Follow-through",
            value: isBot ? `${s.bestStreak}W` : p.followThrough.n ? `${p.followThrough.passed}/${p.followThrough.n}` : "—",
            sub: isBot ? `current ${s.streak > 0 ? `${s.streak}W` : s.streak < 0 ? `${-s.streak}L` : "—"}` : "challenges completed",
            icon: isBot ? <Flame className="size-3.5" /> : <Swords className="size-3.5" />,
          },
        ]}
      />

      {isMe && !isBot && <ProfileEditor user={target} />}
      {isMe && !isBot && <NotificationSettings publicKey={vapidPublicKey()} />}
      {isMe && !isBot && (
        <SignInMethods {...(await signInInfo(viewer.id))} googleAvailable={googleConfigured()} error={sp.error ? (LINK_ERRORS[sp.error] ?? null) : null} />
      )}

      {s.n === 0 && p.followThrough.n === 0 ? (
        <div className="mt-8">
          <EmptyState title="No settled bets yet">{isMe ? "Once your bets settle, your forecasting profile fills in here." : "Nothing settled in the groups you share."}</EmptyState>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="surface p-5 sm:p-6">
            <h2 className="display mb-1 text-[1.6rem] leading-tight">Calibration</h2>
            <p className="mb-4 text-sm text-muted">{calibrationRead}</p>
            <CalibrationChart buckets={s.calibration} />
            <p className="hint mt-3">Each dot groups calls by stated confidence. Above the line: underconfident. Below: overconfident.</p>
          </section>
          <section className="surface p-5 sm:p-6">
            <h2 className="display mb-1 text-[1.6rem] leading-tight">
              Where {isMe ? "you’re" : isBot ? "it’s" : "they’re"} <em>sharp</em>
            </h2>
            <p className="mb-5 text-sm text-muted">Hit rate by category.</p>
            <CategoryBars
              rows={p.categories.map((c) => ({
                label: categoryOf(c.category).label,
                value: c.winRate,
                n: c.n,
                detail: `${c.n} ${c.n === 1 ? "call" : "calls"}${c.edge !== null ? ` · edge ${edgePoints(c.edge)}` : ""}`,
              }))}
            />
          </section>
          {!isBot && (
            <section className="surface p-5 sm:p-6 lg:col-span-2">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="display text-[1.6rem] leading-tight">Winnings over time</h2>
                <span className={`display text-[1.75rem] leading-none ${s.netCents > 0 ? "text-yes" : s.netCents < 0 ? "text-no" : ""}`}>{signedMoney(s.netCents)}</span>
              </div>
              <PnlChart points={p.pnl} tz={tz} />
            </section>
          )}
          {p.headToHead.length > 0 && (
            <section className="surface p-5 sm:p-6">
              <h2 className="display mb-4 text-[1.6rem] leading-tight">Head to head</h2>
              {(nemesis || victim) && (
                <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                  {victim && (
                    <div className="rounded-xl bg-yes/[0.07] p-3">
                      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-yes">Owns</p>
                      <p className="display mt-0.5 truncate text-xl">{victim.user.isBot ? "Claude" : firstName(victim.user.name)}</p>
                    </div>
                  )}
                  {nemesis && (
                    <div className="rounded-xl bg-no/[0.07] p-3">
                      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-no">Nemesis</p>
                      <p className="display mt-0.5 truncate text-xl">{nemesis.user.isBot ? "Claude" : firstName(nemesis.user.name)}</p>
                    </div>
                  )}
                </div>
              )}
              <ul className="space-y-2.5">
                {p.headToHead.map((h) => (
                  <li key={h.user.id} className="flex items-center gap-3">
                    <Avatar user={h.user} size="sm" />
                    <span className="flex-1 truncate text-sm">{h.user.isBot ? "Claude" : firstName(h.user.name)}</span>
                    <span className="num text-sm">
                      <span className="text-yes">{h.wins}</span>
                      <span className="text-faint">–</span>
                      <span className="text-no">{h.losses}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="hint mt-3">Only counts bets where you were on opposite sides.</p>
            </section>
          )}
          {!isBot && p.vsClaude && (
            <section className="surface relative overflow-hidden p-5 sm:p-6" style={{ borderColor: "color-mix(in oklab, var(--color-claude) 22%, transparent)" }}>
              <h2 className="display mb-1 text-[1.6rem] leading-tight">
                <em>vs.</em> Claude
              </h2>
              <p className="mb-4 text-sm text-muted">On public bets you both played.</p>
              <div className="flex items-center gap-5">
                <Avatar user={target} size="lg" />
                <p className="display text-5xl leading-none">
                  {p.vsClaude.wins}
                  <span className="text-faint">–</span>
                  {p.vsClaude.losses}
                </p>
                <Avatar user={{ id: CLAUDE_ID, name: "Claude", image: null, isBot: true }} size="lg" />
              </div>
              <p className="mt-3 text-sm text-soft">
                {p.vsClaude.wins > p.vsClaude.losses ? "Ahead of the machine. For now." : p.vsClaude.wins < p.vsClaude.losses ? "The bot is winning this one." : "Dead even."}
                {p.vsClaude.ties > 0 && <span className="text-muted"> ({p.vsClaude.ties} where you agreed or both missed)</span>}
              </p>
            </section>
          )}
        </div>
      )}

      {history.length > 0 && (
        <>
          <SectionHeader title="Bets" count={history.length} />
          <div className="grid gap-3 md:grid-cols-2">
            {history.map((b, i) => (
              <BetCard key={b.id} bet={b} now={now} showGroup={shared.length > 1} index={i} />
            ))}
          </div>
        </>
      )}
      {isMe && (
        <p className="mt-10 text-center text-xs text-faint">
          Only people in groups you share can see your record. <Link href="/privacy" className="underline">Privacy</Link>
        </p>
      )}
    </div>
  );
}


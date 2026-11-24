import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, BadgeCheck, CircleSlash, ExternalLink, Gavel, Globe, Lock, Scale, Sparkles, Swords, Trophy, UserRound } from "lucide-react";
import { betRating } from "@/lib/data/stats";
import { requireUser } from "@/lib/auth/current";
import { membership } from "@/lib/data/common";
import { betDetail, groupOf, type BetVM, type PositionVM } from "@/lib/data/bets";
import { canPropose, canReview, canTakePosition, claudeFallbackOpen, phaseOf } from "@/lib/engine/rules";
import { housekeeping } from "@/lib/server/housekeeping";
import { claudeEnabled } from "@/lib/claude/agent";
import { viewerTimeZone } from "@/lib/tz";
import { firstName, formatDateTime, money, pct, relativeTime, signedMoney } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { ClaudeGlyph } from "@/components/ui/avatar";
import { CategoryPicker } from "@/components/bet/category-picker";
import { Countdown } from "@/components/ui/countdown";
import { StatusPill } from "@/components/bet/status-pill";
import { BinaryBar } from "@/components/bet/odds";
import { optionColor } from "@/components/bet/palette";
import { PositionForm } from "@/components/bet/position-form";
import { CallPanel } from "@/components/bet/call-panel";
import { ReviewPanel } from "@/components/bet/review-panel";
import {
  AskClaudeButton,
  AutoRefresh,
  CancelBetButton,
  CommentBox,
  DeleteCommentButton,
  ShareButton,
  WinConfetti,
} from "@/components/bet/small-actions";
import { requestNow } from "@/lib/now";

export const maxDuration = 300;

type Props = { params: Promise<{ betId: string }>; searchParams: Promise<{ new?: string }> };

export async function generateMetadata({ params }: Props) {
  const { betId } = await params;
  const user = await requireUser();
  const g = await groupOf(betId);
  if (!g || !(await membership(g.groupId, user.id))) return { title: "Bet" };
  const d = await betDetail(betId, user.id);
  return { title: d?.bet.title ?? "Bet" };
}

export default async function BetPage({ params, searchParams }: Props) {
  const { betId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const g = await groupOf(betId);
  if (!g || !(await membership(g.groupId, user.id))) notFound();
  await housekeeping([g.groupId]);
  const d = await betDetail(betId, user.id);
  if (!d) notFound();
  const { bet, raw, tally } = d;
  const now = requestNow();
  const tz = await viewerTimeZone();
  const rating = await betRating(betId);

  const humanPositions = bet.positions.filter((p) => !p.user.isBot);
  const canTake = canTakePosition(raw, user.id, now).ok;
  const callCheck = canPropose(raw, user.id, now, humanPositions.length + (bet.claude.state === "revealed" ? 1 : 0));
  const isCaller = bet.proposedBy?.id === user.id;
  const showCall =
    callCheck.ok &&
    raw.judgeMode !== "claude" &&
    (bet.status === "open" || isCaller);
  const showClaudeFallback = raw.judgeMode === "claude" && callCheck.ok && bet.status === "open" && claudeFallbackOpen(raw, now);
  const reviewCheck = canReview(raw, humanPositions.map((p) => ({ userId: p.user.id })), d.reviews, user.id);
  const won = bet.status === "settled" && bet.myResult === "win";
  // Claude may be mid-pick, or about to be kicked off by housekeeping for a due verdict:
  // poll quietly so the result appears without a manual reload.
  const claudeWorking =
    bet.claude.state === "thinking" ||
    raw.claudeResolve === "running" ||
    (claudeEnabled() &&
      raw.judgeMode === "claude" &&
      raw.status === "open" &&
      phaseOf(raw, now) === "awaiting" &&
      (raw.claudeResolve === "none" || raw.claudeResolve === "pending"));
  const isNew = sp.new === "1";

  const actionPanel = (
    <ActionPanel
      bet={bet}
      userId={user.id}
      canTake={canTake}
      showCall={showCall || showClaudeFallback}
      claudeFallback={showClaudeFallback}
      showReview={reviewCheck.ok}
      raw={{ judgeMode: raw.judgeMode, claudeResolve: raw.claudeResolve }}
      now={now}
      claudeOn={claudeEnabled()}
      tally={tally}
    />
  );

  return (
    <article className="mx-auto max-w-[1040px]">
      {won && <WinConfetti betId={bet.id} />}
      {claudeWorking && <AutoRefresh />}

      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href={`/g/${bet.groupId}`} className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
          <ArrowLeft className="size-4" /> {bet.group.name}
        </Link>
        <ShareButton title={bet.title} />
      </div>

      {isNew && (
        <div className="surface mb-6 flex animate-rise items-center gap-3 border-iris/30 bg-iris/10 p-4 text-sm">
          <Sparkles className="size-5 shrink-0 text-iris" />
          <p>
            Bet posted. Share the link in your group chat — only members of <b>{bet.group.name}</b> can see it.
            {bet.isPublic && claudeEnabled() && " Claude is researching its sealed pick now."}
          </p>
        </div>
      )}

      <header className="mb-8 animate-rise">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <CategoryPicker betId={bet.id} category={bet.category} />
          <StatusPill phase={bet.phase} closesAt={bet.closesAt} resolvesAt={bet.resolvesAt} reviewDeadline={bet.reviewDeadline} voteDeadline={bet.voteDeadline} now={now} />
          {bet.isPublic && (
            <span className="chip">
              <Globe className="size-3.5" /> Public event
            </span>
          )}
          {rating &&
            (rating.rated ? (
              <span className="chip border-yes/30 bg-yes/10 text-yes" title="This bet counts toward everyone's forecasting scores.">
                <BadgeCheck className="size-3.5" /> Rated
              </span>
            ) : (
              <span className="chip text-muted" title={`${rating.reason} Money still settled as normal.`}>
                <CircleSlash className="size-3.5" /> Unrated
              </span>
            ))}
          <span className="chip">{bet.stakeMode === "money" ? (bet.kind === "challenge" ? `${money(bet.stakeCents)} stake` : bet.customStakes ? "Pick your stake" : `${money(bet.stakeCents)} each`) : "Bragging rights"}</span>
        </div>
        <h1 className="display text-[2.35rem] leading-[1.02] sm:text-[3.4rem]">{bet.title}</h1>
        {bet.description && <p className="mt-4 max-w-3xl whitespace-pre-line text-[1.02rem] leading-relaxed text-soft">{bet.description}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          <Person label="Posted by" user={bet.creator} />
          {bet.judge && (
            <Person label="Judge" user={bet.judge} icon={<Gavel className="size-3.5" />} />
          )}
          {bet.subject && <Person label="About" user={bet.subject} icon={<UserRound className="size-3.5" />} />}
        </div>
        {rating && !rating.rated && (
          <p className="mt-4 flex max-w-3xl items-start gap-2 text-sm text-muted">
            <CircleSlash className="mt-0.5 size-4 shrink-0" />
            <span>
              Doesn&apos;t count toward forecasting scores: {rating.reason.charAt(0).toLowerCase() + rating.reason.slice(1)} Money settled as normal.
            </span>
          </p>
        )}
      </header>

      {/* One copy of every panel. On mobile the two columns dissolve (display: contents)
          and `order` interleaves them; on desktop they're a main column + sidebar. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="contents min-w-0 lg:block lg:space-y-6">
          <div className="order-1 empty:hidden lg:order-none">
            <Outcome bet={bet} tally={tally} now={now} tz={tz} settlements={d.settlements} reviews={d.reviews} />
          </div>
          <div className="order-2 lg:order-none">
            <Market bet={bet} />
          </div>
          <div className="order-4 empty:hidden lg:order-none">
            <ClaudeCard bet={bet} raw={{ judgeMode: raw.judgeMode, claudeResolve: raw.claudeResolve }} now={now} claudeOn={claudeEnabled()} />
          </div>
          {bet.criteria && (
            <section className="surface order-5 p-5 lg:order-none">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-soft">
                <Scale className="size-4 text-iris" /> How it&apos;s judged
              </h2>
              <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-soft">{bet.criteria}</p>
            </section>
          )}
          <div className="order-6 empty:hidden lg:order-none">
            <Positions bet={bet} />
          </div>
          <div className="order-7 lg:order-none">
            <Comments betId={bet.id} comments={d.comments} viewerId={user.id} now={now} />
          </div>
        </div>

        <aside className="contents lg:block lg:space-y-6">
          <div className="order-3 empty:hidden lg:order-none">{actionPanel}</div>
          <div className="order-8 lg:order-none">
            <Timeline bet={bet} tz={tz} now={now} />
          </div>
          {bet.creator.id === user.id && bet.status === "open" && humanPositions.every((p) => p.user.id === user.id) && (
            <div className="order-9 flex justify-end lg:order-none">
              <CancelBetButton betId={bet.id} />
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}

function Person({ label, user, icon }: { label: string; user: BetVM["creator"]; icon?: React.ReactNode }) {
  const inner = (
    <>
      {icon}
      <span>{label}</span>
      <Avatar user={user} size="xs" />
      <span className="font-medium text-soft">{user.isBot ? "Claude" : firstName(user.name)}</span>
    </>
  );
  return user.isBot ? (
    <span className="flex items-center gap-1.5">{inner}</span>
  ) : (
    <Link href={`/u/${user.id}`} className="flex items-center gap-1.5 transition-colors hover:text-fg">
      {inner}
    </Link>
  );
}

/* ──────────────────────────── Market ──────────────────────────── */

function Market({ bet }: { bet: BetVM }) {
  if (bet.kind === "challenge") return <ChallengeMarket bet={bet} />;
  const total = bet.options.reduce((a, o) => a + o.count, 0);
  const money_ = bet.stakeMode === "money";
  return (
    <section className="surface p-5 sm:p-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="eyebrow">The market</h2>
        <span className="text-sm text-muted">
          {money_ ? (
            <>
              <span className="num text-fg">{money(bet.potCents)}</span> pot ·{" "}
            </>
          ) : null}
          {total} {total === 1 ? "player" : "players"}
        </span>
      </div>
      {bet.kind === "binary" && (
        <div className="mb-6">
          <BinaryBar bet={bet} size="lg" />
        </div>
      )}
      <div className="space-y-3">
        {bet.options.map((o, i) => {
          const c = optionColor(bet.kind, i);
          const won = bet.status === "settled" && bet.outcome?.type === "option" && bet.outcome.optionId === o.id;
          return (
            <div
              key={o.id}
              className="flex items-center gap-3 rounded-2xl border p-3.5"
              style={{
                borderColor: won ? c : "rgb(255 255 255 / .07)",
                background: won ? `color-mix(in oklab, ${c} 10%, transparent)` : "rgb(255 255 255 / .02)",
              }}
            >
              <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
              <div className="min-w-0 flex-1">
                <p className="flex items-start gap-2 font-semibold leading-snug">
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{o.label}</span>
                  {won && <Trophy className="size-4 shrink-0 text-gold" />}
                </p>
                <p className="text-xs text-muted">
                  {o.count} {o.count === 1 ? "backer" : "backers"}
                  {o.crowd !== null && <> · crowd says <span className="num text-soft">{pct(o.crowd)}</span></>}
                </p>
              </div>
              <div className="flex -space-x-1.5">
                {o.backers.slice(0, 4).map((u) => (
                  <Avatar key={u.id} user={u} size="sm" ring />
                ))}
              </div>
              {money_ && (
                <div className="w-[4.5rem] shrink-0 text-right">
                  <p className="num font-semibold">{money(o.pool)}</p>
                  <p className="num text-xs text-muted">{o.multiplier ? `${o.multiplier.toFixed(2)}×` : "—"}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {money_ && (
        <p className="hint mt-4">
          Winners split the losing side&apos;s pot in proportion to their stakes, capped at fair odds (1× your stake on yes/no, up to
          options − 1× on multiple choice). The × shows what $1 on that side returns if it wins, at current stakes.
        </p>
      )}
    </section>
  );
}

function ChallengeMarket({ bet }: { bet: BetVM }) {
  const results = bet.status === "settled" && bet.outcome?.type === "challenge" ? bet.outcome.results : null;
  const ps = bet.positions;
  return (
    <section className="surface p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="eyebrow flex items-center gap-2">
          <Swords className="size-4" /> The challenge
        </h2>
        <span className="text-sm text-muted">
          {bet.stakeMode === "money" ? <>Loser pays <span className="num text-fg">{money(bet.stakeCents)}</span></> : "Bragging rights"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ps.map((p) => {
          const r = results?.[p.id];
          return (
            <div
              key={p.id}
              className={`rounded-2xl border p-4 ${r === "pass" ? "border-yes/40 bg-yes/[0.07]" : r === "fail" ? "border-no/30 bg-no/[0.05]" : "border-white/[0.08] bg-white/[0.02]"}`}
            >
              <div className="mb-3 flex items-center gap-2.5">
                <Avatar user={p.user} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{firstName(p.user.name)}</p>
                  <p className="text-xs text-muted">
                    <span className="num">{p.confidence}%</span> sure they&apos;ll do it
                  </p>
                </div>
                {r && <span className={`chip ${r === "pass" ? "text-yes" : "text-no"}`}>{r === "pass" ? "Did it" : "Didn't"}</span>}
              </div>
              <p className="display text-xl leading-snug">{p.task}</p>
            </div>
          );
        })}
        {bet.phase === "open" && bet.challengeOpponent && !ps.some((p) => p.user.id === bet.challengeOpponent!.id) && (
          <div className="grid place-items-center rounded-2xl border border-dashed border-white/15 p-4 text-center text-sm text-muted">
            <div>
              <Avatar user={bet.challengeOpponent} size="md" className="mx-auto mb-2 opacity-60" />
              Waiting on {firstName(bet.challengeOpponent.name)}
              {bet.challengeOpponentTask && (
                <p className="mt-1 text-xs text-faint">Suggested: “{bet.challengeOpponentTask}”</p>
              )}
            </div>
          </div>
        )}
      </div>
      <p className="hint mt-4">If everyone completes their task, or nobody does, no money changes hands. Otherwise each person who fails pays their stake, split among those who succeed.</p>
    </section>
  );
}

/* ──────────────────────────── Positions ──────────────────────────── */

function Positions({ bet }: { bet: BetVM }) {
  const people = bet.positions.filter((p) => !p.user.isBot);
  if (bet.kind === "challenge" || people.length === 0) return null;
  return (
    <section className="surface overflow-hidden">
      <h2 className="eyebrow px-5 pt-5">Who&apos;s on what</h2>
      <ul className="mt-3 divide-y divide-white/[0.06]">
        {people.map((p) => (
          <PositionRow key={p.id} bet={bet} p={p} />
        ))}
      </ul>
    </section>
  );
}

function PositionRow({ bet, p }: { bet: BetVM; p: PositionVM }) {
  const idx = bet.options.findIndex((o) => o.id === p.optionId);
  const c = optionColor(bet.kind, idx);
  return (
    <li className="flex gap-3 px-5 py-3.5">
      <Link href={`/u/${p.user.id}`}>
        <Avatar user={p.user} size="md" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/u/${p.user.id}`} className="font-semibold hover:underline">
            {firstName(p.user.name)}
          </Link>
          <span className="rounded-md px-1.5 py-0.5 text-xs font-bold" style={{ color: c, background: `color-mix(in oklab, ${c} 14%, transparent)` }}>
            {bet.options[idx]?.label}
          </span>
          <span className="num text-xs text-muted">{p.confidence}% sure</span>
        </div>
        {p.note && <p className="mt-1 text-[0.92rem] text-soft">“{p.note}”</p>}
      </div>
      {bet.stakeMode === "money" && <span className="num shrink-0 pt-0.5 text-sm font-semibold">{money(p.amountCents)}</span>}
    </li>
  );
}

/* ──────────────────────────── Claude ──────────────────────────── */

function ClaudeCard({
  bet,
  raw,
  now,
  claudeOn,
}: {
  bet: BetVM;
  raw: { judgeMode: string; claudeResolve: string };
  now: number;
  claudeOn: boolean;
}) {
  const c = bet.claude;
  if (c.state === "none" && raw.judgeMode !== "claude") return null;
  if (c.state === "none" && !bet.isPublic) return null;
  return (
    <section className="surface relative overflow-hidden p-5 sm:p-6" style={{ borderColor: "color-mix(in oklab, var(--color-claude) 22%, transparent)" }}>
      <div className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-claude/10 blur-3xl" />
      <div className="relative flex items-start gap-3.5">
        <span className={`size-11 shrink-0 ${c.state === "thinking" ? "animate-pulse" : ""}`}>
          <ClaudeGlyph />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Claude&apos;s pick</h2>
            {raw.judgeMode === "claude" && <span className="chip text-[#f3b79f]">Also the oracle</span>}
          </div>
          {c.state === "thinking" && (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-soft">Researching the web and forming a view…</p>
              <div className="skeleton h-3 w-11/12" />
              <div className="skeleton h-3 w-8/12" />
            </div>
          )}
          {c.state === "sealed" && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-soft">
              <Lock className="size-4 text-claude" /> Locked in and sealed. Revealed when betting closes in{" "}
              <Countdown to={bet.closesAt} serverNow={now} className="font-semibold text-fg" />.
            </p>
          )}
          {c.state === "failed" && <p className="mt-1.5 text-sm text-muted">Claude sat this one out{bet.claudeNote ? `: ${bet.claudeNote}` : "."}</p>}
          {c.state === "none" && (
            <p className="mt-1.5 text-sm text-muted">
              {claudeOn ? "Claude didn't play this one." : "Claude isn't connected on this server (no API key)."}
            </p>
          )}
          {c.state === "revealed" && <ClaudeReveal bet={bet} p={c.position} />}
        </div>
      </div>
    </section>
  );
}

function ClaudeReveal({ bet, p }: { bet: BetVM; p: PositionVM }) {
  const idx = bet.options.findIndex((o) => o.id === p.optionId);
  const c = optionColor(bet.kind, idx);
  const settled = bet.status === "settled" && bet.outcome?.type === "option";
  const right = settled && bet.outcome?.type === "option" && bet.outcome.optionId === p.optionId;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="display text-3xl" style={{ color: c }}>
          {bet.options[idx]?.label}
        </span>
        <span className="num rounded-lg bg-white/[0.06] px-2 py-0.5 text-sm">{p.confidence}%</span>
        {settled && <span className={`chip ${right ? "text-yes" : "text-no"}`}>{right ? "Called it" : "Missed"}</span>}
      </div>
      {p.note && <p className="mt-2.5 text-[0.95rem] leading-relaxed text-soft">{p.note}</p>}
      {p.sources && p.sources.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {p.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="chip max-w-[260px] hover:text-fg">
                <ExternalLink className="size-3 shrink-0" /> <span className="truncate">{s.title}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-faint">Claude plays for bragging rights only — it never wins or owes money.</p>
    </div>
  );
}

/* ──────────────────────────── Outcome / review ──────────────────────────── */

function outcomeLabel(bet: BetVM, o: NonNullable<BetVM["outcome"]>) {
  if (o.type === "void") return "Void — everyone refunded";
  if (o.type === "option") return bet.options.find((x) => x.id === o.optionId)?.label ?? "—";
  const passed = bet.positions.filter((p) => o.results[p.id] === "pass").map((p) => firstName(p.user.name));
  if (passed.length === 0) return "Nobody did it";
  if (passed.length === bet.positions.length) return "Everyone did it";
  return `${passed.join(" & ")} did it`;
}

function Outcome({
  bet,
  tally,
  now,
  tz,
  settlements,
  reviews,
}: {
  bet: BetVM;
  tally: { reviewers: string[]; confirms: string[]; disputes: string[]; waitingOn: string[] };
  now: number;
  tz: string;
  settlements: { userId: string; netCents: number; result: string }[];
  reviews: { id: string; kind: "confirm" | "dispute"; reason: string | null; user: BetVM["creator"] }[];
}) {
  if (bet.status === "settled" && bet.outcome) {
    const byUser = new Map(settlements.map((s) => [s.userId, s]));
    const rows = bet.positions.filter((p) => !p.user.isBot);
    const moneyMoved = settlements.some((s) => s.netCents !== 0);
    return (
      <section className="surface relative overflow-hidden p-5 sm:p-6" style={{ borderColor: "rgb(251 191 36 / .25)" }}>
        <div className="pointer-events-none absolute -left-16 -top-24 size-64 rounded-full bg-gold/10 blur-3xl" />
        <p className="eyebrow relative mb-1 flex items-center gap-2 text-gold">
          {bet.outcome.type === "void" ? <Ban className="size-4" /> : <Trophy className="size-4" />} Final result
        </p>
        <p className="display relative text-4xl">{outcomeLabel(bet, bet.outcome)}</p>
        {bet.proposalNote && <p className="relative mt-2 whitespace-pre-line text-sm text-soft">{linkify(bet.proposalNote)}</p>}
        <p className="relative mt-2 text-xs text-faint">
          Called by {bet.proposedBy?.isBot ? "Claude" : bet.proposedBy ? firstName(bet.proposedBy.name) : "the judge"} ·{" "}
          {bet.settledVia === "vote" ? "decided by vote" : bet.settledVia === "window" ? "no disputes" : "confirmed by everyone"}
          {bet.settledAt && <> · {formatDateTime(bet.settledAt, tz)}</>}
        </p>
        {rows.length > 0 && (
          <ul className="relative mt-5 grid gap-2 sm:grid-cols-2">
            {rows.map((p) => {
              const s = byUser.get(p.user.id);
              const tone = s?.result === "win" ? "text-yes" : s?.result === "loss" ? "text-no" : "text-muted";
              return (
                <li key={p.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2">
                  <Avatar user={p.user} size="sm" />
                  <span className="flex-1 truncate text-sm font-medium">{firstName(p.user.name)}</span>
                  <span className={`num text-sm font-semibold ${tone}`}>
                    {bet.stakeMode === "money" && moneyMoved ? signedMoney(s?.netCents ?? 0) : s?.result === "win" ? "Won" : s?.result === "loss" ? "Lost" : "Push"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {bet.stakeMode === "money" && !moneyMoved && bet.outcome.type !== "void" && (
          <p className="relative mt-3 text-xs text-muted">Nobody was on the other side, so no money changed hands — but the picks still count.</p>
        )}
      </section>
    );
  }
  if (bet.status === "cancelled") {
    return (
      <section className="surface p-5 text-sm text-muted">
        <Ban className="mb-2 size-5" /> This bet was cancelled before anyone else joined.
      </section>
    );
  }
  if ((bet.status === "proposed" || bet.status === "disputed") && bet.proposal) {
    const disputed = bet.status === "disputed";
    const color = disputed ? "#fb7185" : "#5ccbff";
    return (
      <section className="surface p-5 sm:p-6" style={{ borderColor: `color-mix(in oklab, ${color} 30%, transparent)` }}>
        <p className="eyebrow mb-1" style={{ color }}>
          {disputed ? "Disputed — vote in progress" : "The call is in"}
        </p>
        <p className="display text-[2.1rem] leading-tight">{outcomeLabel(bet, bet.proposal)}</p>
        <p className="mt-1 text-sm text-muted">
          by {bet.proposedBy?.isBot ? "Claude" : bet.proposedBy ? firstName(bet.proposedBy.name) : "the judge"}
          {bet.proposedAt && <> · {relativeTime(bet.proposedAt, now)}</>}
        </p>
        {bet.proposalNote && <p className="mt-3 whitespace-pre-line rounded-xl bg-white/[0.03] p-3 text-sm text-soft">{linkify(bet.proposalNote)}</p>}
        <div className="mt-4 text-sm text-muted">
          {disputed ? (
            <p>
              <span className="text-yes">{tally.confirms.length} uphold</span> · <span className="text-no">{tally.disputes.length} void</span> ·{" "}
              {tally.waitingOn.length} yet to vote. Majority wins; ties void. Voting ends in{" "}
              <Countdown to={bet.voteDeadline ?? now} serverNow={now} className="text-fg" />.
            </p>
          ) : (
            <p>
              {tally.confirms.length} of {tally.reviewers.length} confirmed. Becomes final in{" "}
              <Countdown to={bet.reviewDeadline ?? now} serverNow={now} className="text-fg" /> unless someone disputes.
            </p>
          )}
        </div>
        {reviews.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
            {reviews.map((r) => (
              <li key={r.id} className="flex gap-2.5 text-sm">
                <Avatar user={r.user} size="xs" className="mt-0.5" />
                <p className="min-w-0">
                  <span className="font-semibold">{firstName(r.user.name)}</span>{" "}
                  <span className={r.kind === "confirm" ? "text-yes" : "text-no"}>
                    {r.kind === "confirm" ? (disputed ? "voted to uphold" : "confirmed") : disputed ? "voted to void" : "disputed"}
                  </span>
                  {r.reason && <span className="text-soft"> — “{r.reason}”</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }
  return null;
}

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-sky underline decoration-sky/30 underline-offset-2">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/* ──────────────────────────── Action panel ──────────────────────────── */

function ActionPanel({
  bet,
  userId,
  canTake,
  showCall,
  claudeFallback,
  showReview,
  raw,
  now,
  claudeOn,
  tally,
}: {
  bet: BetVM;
  userId: string;
  canTake: boolean;
  showCall: boolean;
  claudeFallback: boolean;
  showReview: boolean;
  raw: { judgeMode: string; claudeResolve: string };
  now: number;
  claudeOn: boolean;
  tally: { reviewers: string[] };
}) {
  const blocks: React.ReactNode[] = [];

  if (showReview) {
    const disputed = bet.status === "disputed";
    blocks.push(
      <section key="review" className="surface p-5" style={{ borderColor: disputed ? "rgb(251 113 133 / .3)" : "rgb(92 203 255 / .3)" }}>
        <p className="mb-1 font-semibold">{disputed ? "Cast your vote" : "Do you agree with the call?"}</p>
        <p className="hint mb-4">
          {disputed
            ? "Uphold the judge's call, or void the bet and refund everyone."
            : `Confirm to settle faster. ${tally.reviewers.length > 1 ? "When everyone confirms, it's final." : ""}`}
        </p>
        <ReviewPanel betId={bet.id} disputed={disputed} />
      </section>,
    );
  }

  if (showCall) {
    const early = bet.phase === "open" || bet.phase === "locked";
    const revising = bet.status === "proposed" || bet.status === "disputed";
    const panel = (
      <CallPanel
        betId={bet.id}
        kind={bet.kind}
        options={bet.options.map((o) => ({ id: o.id, label: o.label }))}
        participants={bet.positions.filter((p) => !p.user.isBot).map((p) => ({ positionId: p.id, name: firstName(p.user.name), task: p.task }))}
        early={early}
        revising={revising}
        claudeFallback={claudeFallback}
      />
    );
    blocks.push(
      early || revising ? (
        <details key="call" className="surface group p-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
            <span className="flex items-center gap-2">
              <Gavel className="size-4 text-gold" /> {revising ? "Revise your call" : "Call it early"}
            </span>
            <span className="text-faint transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="mt-4">{panel}</div>
        </details>
      ) : (
        <section key="call" className="surface p-5" style={{ borderColor: "rgb(251 191 36 / .3)" }}>
          {panel}
        </section>
      ),
    );
  }

  if (raw.judgeMode === "claude" && bet.status === "open" && !claudeFallback) {
    const due = bet.phase === "awaiting";
    const running = raw.claudeResolve === "running";
    const participant = bet.positions.some((p) => p.user.id === userId) || bet.creator.id === userId;
    blocks.push(
      <section key="oracle" className="surface p-5">
        <p className="mb-1 flex items-center gap-2 font-semibold">
          <span className="inline-block size-5 shrink-0"><ClaudeGlyph /></span> Claude is the oracle
        </p>
        <p className="hint mb-4">
          {running
            ? "Claude is researching the outcome right now…"
            : due
              ? raw.claudeResolve === "pending"
                ? "Claude checked and it's too early to call. It'll look again in a few hours."
                : "This is due — Claude will research the result and make the call."
              : "When this comes due, Claude will look up what happened and make the call, with sources. Everyone gets 24h to dispute."}
        </p>
        {claudeOn && participant && !running && (due || bet.phase === "locked") && <AskClaudeButton betId={bet.id} label={due ? "Ask Claude to call it now" : "Ask Claude to check early"} />}
      </section>,
    );
  }

  if (canTake) {
    blocks.push(
      <section key="take" className="surface p-5 sm:p-6">
        {!bet.mine && <h2 className="display mb-4 text-[1.7rem]">{bet.kind === "challenge" ? "Accept the challenge" : "Get in on it"}</h2>}
        {bet.mine && <h2 className="mb-4 font-semibold">Your position</h2>}
        <PositionForm
          bet={{
            id: bet.id,
            kind: bet.kind,
            stakeMode: bet.stakeMode,
            stakeCents: bet.stakeCents,
            customStakes: bet.customStakes,
            options: bet.options.map((o) => ({ id: o.id, label: o.label, pool: o.pool, count: o.count })),
            subjectIsViewer: bet.subject?.id === userId,
            opponentTaskSuggestion: bet.challengeOpponent?.id === userId ? bet.challengeOpponentTask : null,
            mine: bet.mine
              ? { optionId: bet.mine.optionId, amountCents: bet.mine.amountCents, confidence: bet.mine.confidence, note: bet.mine.note, task: bet.mine.task }
              : null,
          }}
        />
      </section>,
    );
  } else if (bet.mine && bet.status !== "settled" && bet.status !== "cancelled") {
    const idx = bet.options.findIndex((o) => o.id === bet.mine!.optionId);
    blocks.push(
      <section key="mine" className="surface p-5">
        <p className="eyebrow mb-2">Your position · locked</p>
        <p className="display text-3xl" style={{ color: bet.kind === "challenge" ? undefined : optionColor(bet.kind, idx) }}>
          {bet.kind === "challenge" ? bet.mine.task : bet.options[idx]?.label}
        </p>
        <p className="mt-1 text-sm text-muted">
          {bet.stakeMode === "money" && <span className="num">{money(bet.mine.amountCents)} · </span>}
          <span className="num">{bet.mine.confidence}%</span> confident
        </p>
      </section>,
    );
  } else if (bet.phase === "open" && bet.judge?.id === userId && bet.judgeMode === "person") {
    blocks.push(
      <section key="judge-note" className="surface p-5 text-sm text-muted">
        <Gavel className="mb-2 size-5 text-gold" />
        You&apos;re the neutral judge on this one, so you can&apos;t bet. You&apos;ll make the call when it&apos;s due (
        <Countdown to={bet.resolvesAt} serverNow={now} />
        ).
      </section>,
    );
  }

  if (blocks.length === 0) return null;
  return <div className="space-y-4">{blocks}</div>;
}

/* ──────────────────────────── Timeline & comments ──────────────────────────── */

function Timeline({ bet, tz, now }: { bet: BetVM; tz: string; now: number }) {
  const steps: { label: string; at: number | null; done: boolean }[] = [
    { label: "Posted", at: bet.createdAt, done: true },
    { label: "Betting closes", at: bet.closesAt, done: now >= bet.closesAt || bet.status !== "open" },
    { label: "Result due", at: bet.resolvesAt, done: now >= bet.resolvesAt || bet.status === "settled" },
    { label: "Called", at: bet.proposedAt, done: Boolean(bet.proposedAt) },
    { label: bet.status === "cancelled" ? "Cancelled" : "Final", at: bet.settledAt, done: bet.status === "settled" || bet.status === "cancelled" },
  ];
  return (
    <section className="surface p-5">
      <h2 className="eyebrow mb-4">Timeline</h2>
      <ol className="space-y-3.5">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <span className={`size-2.5 shrink-0 rounded-full ${s.done ? "bg-iris shadow-[0_0_10px] shadow-iris/60" : "border border-white/20"}`} />
            <span className={`flex-1 ${s.done ? "text-fg" : "text-muted"}`}>{s.label}</span>
            <span className="text-xs text-muted">{s.at ? formatDateTime(s.at, tz) : "—"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Comments({
  betId,
  comments,
  viewerId,
  now,
}: {
  betId: string;
  comments: { id: string; body: string; user: BetVM["creator"]; createdAt: number }[];
  viewerId: string;
  now: number;
}) {
  return (
    <section className="surface p-5 sm:p-6">
      <h2 className="eyebrow mb-4">Trash talk {comments.length > 0 && <span className="num ml-1 text-faint">{comments.length}</span>}</h2>
      {comments.length > 0 && (
        <ul className="mb-5 space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="group flex gap-3">
              <Avatar user={c.user} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">
                  <span className="font-semibold text-soft">{firstName(c.user.name)}</span> · {relativeTime(c.createdAt, now)}
                </p>
                <p className="mt-0.5 whitespace-pre-line break-words text-[0.95rem]">{c.body}</p>
              </div>
              {c.user.id === viewerId && <DeleteCommentButton id={c.id} />}
            </li>
          ))}
        </ul>
      )}
      <CommentBox betId={betId} />
    </section>
  );
}

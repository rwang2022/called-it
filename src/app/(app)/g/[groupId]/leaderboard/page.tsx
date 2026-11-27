import { CLAUDE_ID } from "@/lib/engine/rules";
import { edgePoints } from "@/lib/engine/rating";
import Link from "next/link";
import { Crown, Flame, Gavel, Info } from "lucide-react";
import { groupMemberList, requireMember } from "@/lib/data/common";
import { leaderboard, versusClaude, type LeaderRow } from "@/lib/data/stats";
import { CATEGORIES } from "@/lib/categories";
import { DAY } from "@/lib/engine/rules";
import { MIN_GRADED } from "@/lib/engine/scoring";
import { firstName, pct, signedMoney } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { CategoryIcon } from "@/components/ui/category";
import { EmptyState } from "@/components/ui/section";
import { Sparkline } from "@/components/charts";
import { requestNow } from "@/lib/now";

export const metadata = { title: "Leaderboard" };

const METRICS = [
  { id: "skill", label: "Forecasting", blurb: "Edge: how much better your forecasts were than everyone else's on the same bets (Brier score, confidence included). Calling sure things earns nothing; knowing something the room didn't does. Only rated bets count." },
  { id: "profit", label: "Profit", blurb: "Net winnings across money bets. Claude plays for free, so it isn't ranked here." },
  { id: "winrate", label: "Win rate", blurb: "Share of rated calls that came true, ignoring confidence and stakes." },
  { id: "judges", label: "Judges", blurb: "Who makes clean, timely calls. Overturned = a dispute vote voided their call." },
] as const;
const RANGES = [
  { id: "all", label: "All time", ms: null },
  { id: "year", label: "This year", ms: "year" },
  { id: "90d", label: "90 days", ms: 90 * DAY },
] as const;

type Props = { params: Promise<{ groupId: string }>; searchParams: Promise<{ by?: string; range?: string; cat?: string }> };

export default async function LeaderboardPage({ params, searchParams }: Props) {
  const { groupId } = await params;
  const sp = await searchParams;
  const { user } = await requireMember(groupId);
  const by = (METRICS.find((m) => m.id === sp.by)?.id ?? "skill") as (typeof METRICS)[number]["id"];
  const range = RANGES.find((r) => r.id === sp.range) ?? RANGES[0];
  const cat = CATEGORIES.find((c) => c.id === sp.cat)?.id ?? null;
  const sinceMs = range.ms === null ? null : range.ms === "year" ? new Date(new Date().getFullYear(), 0, 1).getTime() : requestNow() - range.ms;

  const members = await groupMemberList(groupId);
  const lb = await leaderboard([groupId], members.map((m) => m.id), { category: cat, sinceMs });
  const ranked = by === "profit" ? lb.byProfit : by === "winrate" ? lb.byWinRate : lb.bySkill;
  const visible = ranked.filter((r) => r.n > 0 || r.followThrough.n > 0 || (by === "profit" && r.stakedCents > 0));
  const pnlBy = new Map(lb.pnl.map((s) => [s.user.id, s.points]));
  const nameOf = new Map<string, string>([...members.map((m): [string, string] => [m.id, firstName(m.name)]), [CLAUDE_ID, "Claude"]]);
  const vsBot = versusClaude(lb.graded);
  const meta = METRICS.find((m) => m.id === by)!;

  const href = (next: Partial<{ by: string; range: string; cat: string | null }>) => {
    const q = new URLSearchParams();
    const b = next.by ?? by;
    const r = next.range ?? range.id;
    const c = next.cat === null ? null : (next.cat ?? cat);
    if (b !== "skill") q.set("by", b);
    if (r !== "all") q.set("range", r);
    if (c) q.set("cat", c);
    const s = q.toString();
    return `/g/${groupId}/leaderboard${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      {/* Filters: one row above everything they scope */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1">
          {METRICS.map((m) => (
            <Link
              key={m.id}
              href={href({ by: m.id })}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${by === m.id ? "bg-white text-ink-950" : "text-muted hover:text-fg"}`}
            >
              {m.label}
            </Link>
          ))}
        </div>
        <div className="flex rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1">
          {RANGES.map((r) => (
            <Link
              key={r.id}
              href={href({ range: r.id })}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${range.id === r.id ? "bg-white/15 text-fg" : "text-muted hover:text-fg"}`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="scrollbar-none -mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <Link href={href({ cat: null })} className={`chip h-8 shrink-0 px-3 ${!cat ? "bg-white/15 text-fg" : "hover:text-fg"}`}>
          All categories
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.id}
            href={href({ cat: c.id })}
            className={`chip h-8 shrink-0 px-3 ${cat === c.id ? "text-fg" : "hover:text-fg"}`}
            style={cat === c.id ? { background: `oklch(0.78 0.13 ${c.hue} / .16)`, borderColor: `oklch(0.78 0.13 ${c.hue} / .5)` } : undefined}
          >
            <CategoryIcon id={c.id} className="size-3.5" /> {c.label}
          </Link>
        ))}
      </div>

      <p className="mb-6 flex max-w-2xl gap-2 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          {meta.blurb.replace(/\*/g, "")}{" "}
          <Link href="/how-it-works" className="underline decoration-white/20 underline-offset-2 hover:text-fg">
            How scoring works
          </Link>
        </span>
      </p>

      {by === "judges" ? (
        <JudgesBoard rows={lb.judges} />
      ) : visible.length === 0 ? (
        <EmptyState title="No results yet">Settle a few bets{cat ? " in this category" : ""} and the rankings appear here.</EmptyState>
      ) : (
        <>
          <Podium rows={visible.slice(0, 3)} by={by} />
          <div className="surface mt-6 overflow-hidden">
            <div className="hidden grid-cols-[2rem_minmax(0,1fr)_5rem_5rem_5.5rem_6.5rem] gap-3 border-b border-white/[0.06] px-5 py-3 text-xs font-medium text-faint sm:grid">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Record</span>
              <span className="text-right">Edge</span>
              <span className="text-right">Net</span>
              <span className="text-right">Trend</span>
            </div>
            <ol className="divide-y divide-white/[0.05]">
              {visible.map((r, i) => (
                <li key={r.user.id}>
                  <Link
                    href={`/u/${r.user.id}`}
                    className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.03] sm:grid-cols-[2rem_minmax(0,1fr)_5rem_5rem_5.5rem_6.5rem] ${
                      r.user.id === user.id ? "bg-iris/[0.06]" : ""
                    }`}
                  >
                    <span className="display text-xl italic text-faint">{i + 1}</span>
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar user={r.user} size="md" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate font-semibold">
                          {r.user.isBot ? "Claude" : firstName(r.user.name)}
                          {r.user.id === user.id && <span className="text-xs font-normal text-muted">(you)</span>}
                          {r.streak >= 3 && <Flame className="size-4 text-gold" aria-label={`${r.streak}-win streak`} />}
                        </span>
                        <span className="block text-xs text-muted">
                          {r.provisional ? `Provisional · ${r.n}/${MIN_GRADED} rated calls` : `${r.n} rated calls`}
                          {r.followThrough.n > 0 && ` · ${r.followThrough.passed}/${r.followThrough.n} challenges`}
                        </span>
                        {r.edgeSource && r.edge !== null && r.edge > 0 && (
                          <span className="block text-xs text-gold" title="Most of this edge was won from a single person. Worth a look if that account is new or never seems to try.">
                            {Math.round(r.edgeSource.share * 100)}% of this edge came from {nameOf.get(r.edgeSource.userId) ?? "one person"}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="num text-right text-lg font-semibold sm:hidden">{headline(r, by)}</span>
                    <span className="num hidden text-right text-sm sm:block">
                      {r.wins}–{r.losses}
                    </span>
                    <span className={`num hidden text-right text-sm sm:block ${by === "skill" ? "font-semibold text-fg" : "text-soft"}`}>{skill(r)}</span>
                    <span className={`num hidden text-right text-sm sm:block ${r.netCents > 0 ? "text-yes" : r.netCents < 0 ? "text-no" : "text-muted"} ${by === "profit" ? "font-semibold" : ""}`}>
                      {r.user.isBot ? "—" : signedMoney(r.netCents)}
                    </span>
                    <span className="hidden justify-end sm:flex">{r.user.isBot ? <span className="text-xs text-faint">—</span> : <Sparkline points={pnlBy.get(r.user.id) ?? []} />}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
          {vsBot.size > 0 && <BeatTheBot rec={vsBot} members={members} />}
        </>
      )}
    </div>
  );
}

const skill = (r: LeaderRow) => edgePoints(r.edge);
function headline(r: LeaderRow, by: string) {
  if (by === "profit") return r.user.isBot ? "—" : signedMoney(r.netCents);
  if (by === "winrate") return r.n ? pct(r.winRate) : "—";
  return skill(r);
}

function Podium({ rows, by }: { rows: LeaderRow[]; by: string }) {
  const order = rows.length === 3 ? [rows[1], rows[0], rows[2]] : rows;
  const heights = rows.length === 3 ? ["h-24", "h-32", "h-20"] : ["h-32", "h-24", "h-20"];
  const medal = ["#fbbf24", "#cbd5e1", "#d97706"];
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6">
      {order.map((r, i) => {
        const rank = rows.indexOf(r);
        return (
          <Link
            key={r.user.id}
            href={`/u/${r.user.id}`}
            className="flex w-28 animate-rise flex-col items-center sm:w-36"
            style={{ animationDelay: `${(2 - rank) * 90}ms` }}
          >
            <div className="relative mb-3">
              {rank === 0 && <Crown className="absolute -top-6 left-1/2 size-6 -translate-x-1/2 text-gold drop-shadow-[0_0_12px_rgba(251,191,36,.7)]" />}
              <Avatar user={r.user} size={rank === 0 ? "xl" : "lg"} className="ring-4" />
              <span
                className="num absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full text-xs font-bold text-ink-950 ring-4 ring-ink-950"
                style={{ background: medal[rank] }}
              >
                {rank + 1}
              </span>
            </div>
            <p className="display max-w-full truncate text-xl">{r.user.isBot ? "Claude" : firstName(r.user.name)}</p>
            <p className="display text-[2rem] leading-none">{headline(r, by)}</p>
            <div
              className={`mt-3 w-full rounded-t-2xl border border-b-0 border-white/[0.08] ${heights[i]}`}
              style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${medal[rank]} 18%, transparent), transparent)` }}
            />
          </Link>
        );
      })}
    </div>
  );
}

function BeatTheBot({ rec, members }: { rec: Map<string, { wins: number; losses: number; ties: number }>; members: { id: string; name: string; image: string | null; isBot: boolean }[] }) {
  const rows = members
    .map((m) => ({ m, r: rec.get(m.id) }))
    .filter((x): x is { m: (typeof members)[number]; r: { wins: number; losses: number; ties: number } } => Boolean(x.r))
    .sort((a, b) => b.r.wins - b.r.losses - (a.r.wins - a.r.losses));
  return (
    <section id="claude" className="surface mt-8 p-5 sm:p-6" style={{ borderColor: "color-mix(in oklab, var(--color-claude) 22%, transparent)" }}>
      <h2 className="display mb-1 text-[1.8rem]">Beat the bot</h2>
      <p className="mb-5 text-sm text-muted">Head-to-head on public bets you and Claude both played: a win means you were right and Claude wasn&apos;t.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map(({ m, r }) => {
          const diff = r.wins - r.losses;
          return (
            <li key={m.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
              <Avatar user={m} size="sm" />
              <span className="flex-1 truncate text-sm font-medium">{firstName(m.name)}</span>
              <span className="num text-sm text-soft">
                {r.wins}–{r.losses}
                {r.ties > 0 && <span className="text-faint"> ({r.ties} same)</span>}
              </span>
              <span className={`chip ${diff > 0 ? "text-yes" : diff < 0 ? "text-no" : "text-muted"}`}>{diff > 0 ? "Beating Claude" : diff < 0 ? "Losing to Claude" : "Even"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function JudgesBoard({ rows }: { rows: { user: { id: string; name: string; image: string | null; isBot: boolean }; calls: number; disputed: number; overturned: number; medianDelayHours: number | null }[] }) {
  if (rows.length === 0) return <EmptyState icon={<Gavel className="size-6" />} title="No calls yet">Once judges start calling bets, their track record shows up here.</EmptyState>;
  return (
    <div className="surface overflow-hidden">
      <ol className="divide-y divide-white/[0.05]">
        {rows.map((r, i) => (
          <li key={r.user.id} className="flex items-center gap-3 px-5 py-4">
            <span className="display w-6 text-xl italic text-faint">{i + 1}</span>
            <Avatar user={r.user} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.user.isBot ? "Claude" : firstName(r.user.name)}</p>
              <p className="text-xs text-muted">
                {r.calls} {r.calls === 1 ? "call" : "calls"} · {r.disputed} disputed ·{" "}
                {r.medianDelayHours === null ? "—" : r.medianDelayHours < 1 ? "calls it on time" : `typically ${Math.round(r.medianDelayHours)}h after due`}
              </p>
            </div>
            <div className="text-right">
              <p className={`num text-lg font-semibold ${r.overturned ? "text-no" : "text-yes"}`}>{pct(1 - r.overturned / r.calls)}</p>
              <p className="text-xs text-muted">upheld</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

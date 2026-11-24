"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, CircleHelp, Gavel, Globe, ListChecks, Plus, Swords, ToggleLeft, Trophy, Wallet, X } from "lucide-react";
import { createBet, type CreateBetInput } from "@/lib/actions/bets";
import { CATEGORIES, categoryOf, type CategoryId } from "@/lib/categories";
import { firstName, money, parseDollars } from "@/lib/format";
import { Avatar, ClaudeGlyph } from "../ui/avatar";
import { CategoryIcon } from "../ui/category";
import { useAction } from "../ui/use-action";
import { FieldLabel, SidePicker } from "../ui/form-bits";
import { optionColor } from "../bet/palette";

type Member = { id: string; name: string; image: string | null };
type G = { id: string; name: string; hue: number; members: Member[] };
type Kind = "binary" | "multi" | "challenge";
type JudgeMode = "creator" | "person" | "claude";

const STEPS = ["Type", "Question", "Stakes", "Timing", "Your pick"] as const;

/* ——— time helpers (all in the viewer's local timezone) ——— */
const H = 3_600_000;
const D = 24 * H;
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 0, 0);
  return x.getTime();
};
function presetsClose(now: number) {
  return [
    { label: "1 hour", at: now + H },
    { label: "Tonight", at: endOfDay(new Date(now)) },
    { label: "Tomorrow", at: endOfDay(new Date(now + D)) },
    { label: "3 days", at: endOfDay(new Date(now + 3 * D)) },
    { label: "1 week", at: endOfDay(new Date(now + 7 * D)) },
  ];
}
function presetsResolve(now: number) {
  const d = new Date(now);
  const eow = new Date(d);
  eow.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  const eom = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const eoy = new Date(d.getFullYear(), 11, 31);
  const in3m = new Date(d);
  in3m.setMonth(d.getMonth() + 3);
  return [
    { label: "End of week", at: endOfDay(eow) },
    { label: "End of month", at: endOfDay(eom) },
    { label: "3 months", at: endOfDay(in3m) },
    { label: "End of year", at: endOfDay(eoy) },
  ];
}
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmt = (ms: number) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(ms);

export function CreateBetWizard({ me, groups, initialGroupId, claudeOn }: { me: Member; groups: G[]; initialGroupId: string; claudeOn: boolean }) {
  const [pending, exec] = useAction();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [now] = useState(() => Date.now());

  const [groupId, setGroupId] = useState(initialGroupId);
  const [kind, setKind] = useState<Kind | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CategoryId>("fitness");
  const [isPublic, setIsPublic] = useState(false);
  const [publicTouched, setPublicTouched] = useState(false);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [opponentTask, setOpponentTask] = useState("");
  const [myTask, setMyTask] = useState("");

  const [stakeMode, setStakeMode] = useState<"money" | "bragging">("money");
  const [stakeText, setStakeText] = useState("20");
  const [customStakes, setCustomStakes] = useState(true);

  const [resolvesAt, setResolvesAt] = useState(() => presetsResolve(Date.now())[1].at);
  const [closesAt, setClosesAt] = useState(() => Math.min(presetsClose(Date.now())[3].at, presetsResolve(Date.now())[1].at));
  const [judgeMode, setJudgeMode] = useState<JudgeMode>("creator");
  const [judgeId, setJudgeId] = useState<string | null>(null);

  const [joinNow, setJoinNow] = useState(true);
  const [myOption, setMyOption] = useState<number | null>(null);
  const [myAmountText, setMyAmountText] = useState("20");
  const [confidence, setConfidence] = useState(70);
  const [note, setNote] = useState("");

  const group = groups.find((g) => g.id === groupId)!;
  const others = group.members.filter((m) => m.id !== me.id);
  const cat = categoryOf(category);
  const stakeCents = parseDollars(stakeText) ?? 0;
  const myAmount = stakeMode === "money" ? (customStakes && kind !== "challenge" ? (parseDollars(myAmountText) ?? 0) : stakeCents) : 0;
  const optionLabels = useMemo(() => (kind === "binary" ? ["Yes", "No"] : options.map((o) => o.trim())), [kind, options]);
  const subjectIsMe = subjectId === me.id;
  const effectivePublic = kind !== "challenge" && isPublic;
  const claudeJudgeAllowed = effectivePublic && claudeOn;

  const setCat = (c: CategoryId) => {
    setCategory(c);
    if (!publicTouched) setIsPublic(categoryOf(c).publicByDefault);
  };

  const optionsOk =
    optionLabels.filter(Boolean).length >= 2 &&
    !optionLabels.some((o) => !o) &&
    new Set(optionLabels.map((o) => o.toLowerCase())).size === optionLabels.length;

  /* ——— validation per step ——— */
  const problems = useMemo(() => {
    const p: Record<number, string | null> = {};
    p[0] = kind ? null : "Pick a type of bet.";
    if (title.trim().length < 5) p[1] = "Write the question (5+ characters).";
    else if (kind === "multi" && optionLabels.filter(Boolean).length < 2) p[1] = "Add at least two options.";
    else if (kind === "multi" && new Set(optionLabels.map((o) => o.toLowerCase())).size !== optionLabels.length) p[1] = "Options must be different.";
    else if (kind === "multi" && optionLabels.some((o) => !o)) p[1] = "Fill in or remove empty options.";
    else if (kind === "challenge" && !myTask.trim()) p[1] = "Describe your side of the challenge.";
    else p[1] = null;
    p[2] = stakeMode === "money" && (stakeCents < 100 || stakeCents > 1_000_000) ? "Stakes must be between $1 and $10,000." : null;
    if (closesAt < now + 5 * 60 * 1000) p[3] = "Betting should stay open at least 5 more minutes.";
    else if (resolvesAt < closesAt) p[3] = "The result date can't be before betting closes.";
    else if (judgeMode === "person" && !judgeId) p[3] = "Choose a judge.";
    else if (judgeMode === "creator" && subjectIsMe) p[3] = "The bet is about you, so pick a neutral judge.";
    else if (judgeMode === "person" && judgeId && judgeId === subjectId) p[3] = "The person it's about can't judge it.";
    else if (judgeMode === "person" && kind === "challenge" && judgeId === opponentId) p[3] = "Your opponent can't also judge.";
    else if (judgeMode === "claude" && !claudeJudgeAllowed) p[3] = "Claude can only judge public events.";
    else p[3] = null;
    if (joinNow || kind === "challenge") {
      if (kind !== "challenge" && myOption === null) p[4] = kind === "binary" ? "Pick Yes or No (or choose Just hosting)." : "Pick an option (or choose Just hosting).";
      else if (stakeMode === "money" && customStakes && kind !== "challenge" && (myAmount < 100 || myAmount > 1_000_000)) p[4] = "Your stake must be between $1 and $10,000.";
      else if (judgeMode === "person" && judgeId === me.id) p[4] = "Judges can't bet.";
      else p[4] = null;
    } else p[4] = null;
    return p;
  }, [kind, title, optionLabels, myTask, stakeMode, stakeCents, closesAt, resolvesAt, judgeMode, judgeId, subjectIsMe, subjectId, opponentId, claudeJudgeAllowed, joinNow, myOption, customStakes, myAmount, me.id, now]);

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setStep(to);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    const payload: CreateBetInput = {
      groupId,
      kind: kind!,
      title: title.trim(),
      description: description.trim() || null,
      criteria: criteria.trim() || null,
      category,
      isPublic: effectivePublic,
      options: kind === "multi" ? optionLabels : [],
      stakeMode,
      stakeCents: stakeMode === "money" ? stakeCents : 0,
      customStakes: kind === "challenge" ? false : customStakes,
      subjectId: kind === "challenge" ? null : subjectId,
      closesAt,
      resolvesAt,
      judgeMode,
      judgeId: judgeMode === "person" ? judgeId : null,
      opponentId: kind === "challenge" ? opponentId : null,
      opponentTask: kind === "challenge" ? opponentTask.trim() || null : null,
      mine:
        joinNow || kind === "challenge"
          ? {
              optionIndex: kind === "challenge" ? null : myOption,
              amountCents: myAmount,
              confidence: kind === "binary" ? Math.max(50, confidence) : confidence,
              note: note.trim() || null,
              task: kind === "challenge" ? myTask.trim() : null,
            }
          : null,
    };
    exec(() => createBet(payload));
  };

  const canNext = !problems[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        {step > 0 ? (
          <button className="btn btn-ghost btn-sm px-2.5" onClick={() => go(step - 1)} aria-label="Back">
            <ArrowLeft className="size-4" />
          </button>
        ) : (
          <span className="size-9" />
        )}
        <div className="flex flex-1 gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-iris to-sky"
                initial={false}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          ))}
        </div>
        <span className="num w-9 text-right text-xs text-muted">
          {step + 1}/{STEPS.length}
        </span>
      </div>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={step}
          custom={dir}
          initial={{ opacity: 0, x: dir * 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -28 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === 0 && (
            <Step title="What kind of bet?" sub="You can have as many people on each side as you like.">
              {groups.length > 1 && (
                <div className="mb-6">
                  <p className="label">Group</p>
                  <div className="flex flex-wrap gap-2">
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => {
                          setGroupId(g.id);
                          setSubjectId(null);
                          setJudgeId(null);
                          setOpponentId(null);
                        }}
                        className={`btn btn-sm shrink-0 ${g.id === groupId ? "btn-light" : "btn-ghost"}`}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <FieldLabel done={Boolean(kind)} required>
                Type of bet
              </FieldLabel>
              <div className="grid gap-3">
                <KindCard on={kind === "binary"} onClick={() => setKind("binary")} icon={<ToggleLeft className="size-6" />} hue={150} title="Yes or no" example="“Will Sam do a pull-up by Dec 31?”" />
                <KindCard on={kind === "multi"} onClick={() => setKind("multi")} icon={<ListChecks className="size-6" />} hue={210} title="Multiple choice" example="“Who wins the election?” · “Which film takes Best Picture?”" />
                <KindCard
                  on={kind === "challenge"}
                  onClick={() => setKind("challenge")}
                  icon={<Swords className="size-6" />}
                  hue={268}
                  title="Head-to-head challenge"
                  example="“You do 50 push-ups, I run a sub-25 5K. Whoever can't, pays the other.”"
                />
              </div>
            </Step>
          )}

          {step === 1 && (
            <Step title={kind === "challenge" ? "Set the challenge" : "What's the question?"} sub={kind === "binary" ? "Phrase it so YES means it happens." : undefined}>
              <div className="space-y-6">
                <div>
                  <p className="label">Category</p>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCat(c.id)}
                        className={`chip h-9 px-3 text-[0.82rem] transition-colors ${category === c.id ? "text-fg" : "hover:text-fg"}`}
                        style={category === c.id ? { background: `oklch(0.78 0.13 ${c.hue} / .16)`, borderColor: `oklch(0.78 0.13 ${c.hue} / .5)` } : undefined}
                      >
                        <CategoryIcon id={c.id} className="size-3.5" /> {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor="title" done={title.trim().length >= 5} required>
                    {kind === "challenge" ? "Name it" : "Question"}
                  </FieldLabel>
                  <textarea
                    id="title"
                    rows={2}
                    maxLength={140}
                    className="input display !text-[1.6rem] !leading-tight"
                    placeholder={kind === "challenge" ? "Push-ups vs. 5K: loser buys dinner" : cat.examples[0]}
                    value={title}
                    onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
                  />
                  <p className="num mt-1 text-right text-xs text-faint">{title.length}/140</p>
                </div>

                {kind === "multi" && (
                  <div>
                    <FieldLabel done={optionsOk} required>
                      Options
                    </FieldLabel>
                    <div className="space-y-2">
                      {options.map((o, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: optionColor("multi", i) }} />
                          <input
                            className="input"
                            maxLength={60}
                            value={o}
                            placeholder={`Option ${i + 1}`}
                            onChange={(e) => setOptions((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                          />
                          {options.length > 2 && (
                            <button className="btn btn-ghost h-12 w-12 shrink-0 px-0" onClick={() => setOptions((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove option">
                              <X className="size-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {options.length < 8 && (
                      <button className="btn btn-ghost btn-sm mt-2" onClick={() => setOptions((xs) => [...xs, ""])}>
                        <Plus className="size-4" /> Add option
                      </button>
                    )}
                    <p className="hint mt-2">Tip: add “Something else” so nobody gets stuck with no right answer.</p>
                  </div>
                )}

                {kind === "challenge" && (
                  <div className="space-y-4">
                    <div>
                      <FieldLabel htmlFor="mytask" done={myTask.trim().length > 0} required>
                        Your task
                      </FieldLabel>
                      <input id="mytask" className="input" maxLength={200} value={myTask} onChange={(e) => setMyTask(e.target.value)} placeholder="Run a 5K in under 25:00" />
                    </div>
                    <div>
                      <p className="label">Who are you challenging?</p>
                      <PeoplePicker people={others} value={opponentId} onChange={setOpponentId} allowNone noneLabel="Anyone" />
                    </div>
                    {opponentId && (
                      <div>
                        <label className="label" htmlFor="optask">
                          Suggested task for {firstName(others.find((o) => o.id === opponentId)?.name ?? "them")}
                        </label>
                        <input id="optask" className="input" maxLength={200} value={opponentTask} onChange={(e) => setOpponentTask(e.target.value)} placeholder="50 unbroken push-ups" />
                        <p className="hint mt-1.5">They confirm (or change) their task when they accept. Nobody is signed up without saying yes.</p>
                      </div>
                    )}
                  </div>
                )}

                {kind !== "challenge" && (
                  <div>
                    <p className="label">Is it about someone here? <span className="font-normal text-faint">(optional)</span></p>
                    <PeoplePicker people={group.members} value={subjectId} onChange={setSubjectId} allowNone noneLabel="No one" meId={me.id} />
                    {subjectId && kind === "binary" && <p className="hint mt-2">They can only bet YES on themselves — no sandbagging.</p>}
                  </div>
                )}

                <div>
                  <label className="label" htmlFor="criteria">
                    How will we know? <span className="font-normal text-faint">(strongly recommended)</span>
                  </label>
                  <textarea
                    id="criteria"
                    rows={2}
                    maxLength={500}
                    className="input"
                    value={criteria}
                    onChange={(e) => setCriteria(e.target.value)}
                    placeholder={kind === "challenge" ? "Video proof in the group chat. Strava counts for runs." : "e.g. Official closing price on Dec 31 per Nasdaq. Video evidence for fitness."}
                  />
                  <p className="hint mt-1.5">Most disputes come from vague bets. Name the source and the exact line.</p>
                </div>

                <details className="group">
                  <summary className="cursor-pointer list-none text-sm text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
                    + Add details
                  </summary>
                  <textarea rows={3} maxLength={1000} className="input mt-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Context, backstory, smack talk…" />
                </details>

                {kind !== "challenge" && (
                  <Toggle
                    on={isPublic}
                    onChange={(v) => {
                      setPublicTouched(true);
                      setIsPublic(v);
                      if (!v && judgeMode === "claude") setJudgeMode("creator");
                    }}
                    icon={<Globe className="size-5" />}
                    title="About a public event"
                    sub={
                      claudeOn
                        ? "Markets, sports, politics, weather… Claude researches the web and locks in a sealed pick, and can act as the oracle."
                        : "Markets, sports, politics, weather… (Claude would play here, but it isn't connected on this server.)"
                    }
                  />
                )}
              </div>
            </Step>
          )}

          {step === 2 && (
            <Step title="What's on the line?">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <Choice on={stakeMode === "money"} onClick={() => setStakeMode("money")} icon={<Wallet className="size-5" />} title="Real money" sub="Tracked as IOUs. Settle up later." />
                  <Choice on={stakeMode === "bragging"} onClick={() => setStakeMode("bragging")} icon={<Trophy className="size-5" />} title="Bragging rights" sub="Still counts on the leaderboard." />
                </div>
                {stakeMode === "money" && (
                  <>
                    {kind !== "challenge" && (
                      <div className="grid grid-cols-2 gap-3">
                        <Choice on={customStakes} onClick={() => setCustomStakes(true)} title="Pick your own" sub="Bet what you like. Winners split the pot pro-rata." />
                        <Choice on={!customStakes} onClick={() => setCustomStakes(false)} title="Same for everyone" sub="Everyone puts in the same amount." />
                      </div>
                    )}
                    <div>
                      <FieldLabel htmlFor="stake" done={!problems[2]} required>
                        {kind === "challenge" ? "Whoever fails pays" : customStakes ? "Suggested stake" : "Everyone puts in"}
                      </FieldLabel>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-muted">$</span>
                        <input
                          id="stake"
                          inputMode="decimal"
                          className="input num !h-16 pl-9 !text-3xl"
                          value={stakeText}
                          onChange={(e) => {
                            setStakeText(e.target.value.replace(/[^\d.]/g, ""));
                            setMyAmountText(e.target.value.replace(/[^\d.]/g, ""));
                          }}
                        />
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        {[5, 10, 20, 50, 100].map((v) => (
                          <button
                            key={v}
                            className="btn btn-ghost btn-sm num flex-1 px-0"
                            onClick={() => {
                              setStakeText(String(v));
                              setMyAmountText(String(v));
                            }}
                          >
                            ${v}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="hint flex gap-2">
                      <CircleHelp className="mt-0.5 size-4 shrink-0" />
                      Called It never touches money. It tracks who owes whom and works out the fewest payments to settle up.
                    </p>
                  </>
                )}
              </div>
            </Step>
          )}

          {step === 3 && (
            <Step title="Timing & judging">
              <div className="space-y-7">
                <TimeField
                  label="When will we know the answer?"
                  value={resolvesAt}
                  presets={presetsResolve(now)}
                  onChange={(v) => {
                    setResolvesAt(v);
                    if (closesAt > v) setClosesAt(v);
                  }}
                />
                <TimeField
                  label="When does betting close?"
                  hint="Close it before anyone could know the answer. Positions lock at this time."
                  value={closesAt}
                  presets={[...presetsClose(now).filter((p) => p.at <= resolvesAt), { label: "When result is due", at: resolvesAt }]}
                  onChange={setClosesAt}
                />
                <div>
                  <p className="label">Who judges the outcome?</p>
                  <div className="grid gap-2">
                    <JudgeOption on={judgeMode === "creator"} disabled={subjectIsMe} onClick={() => setJudgeMode("creator")} icon={<Avatar user={me} size="sm" />} title="Me" sub={subjectIsMe ? "Not allowed — the bet is about you." : "You call it; everyone gets 24h to dispute."} />
                    <JudgeOption on={judgeMode === "person"} onClick={() => setJudgeMode("person")} icon={<Gavel className="size-5 text-gold" />} title="A neutral friend" sub="They can't bet on it. Best for anything subjective." />
                    {kind !== "challenge" && (
                      <JudgeOption
                        on={judgeMode === "claude"}
                        disabled={!claudeJudgeAllowed}
                        onClick={() => setJudgeMode("claude")}
                        icon={<span className="inline-block size-7 shrink-0"><ClaudeGlyph /></span>}
                        title="Claude, the oracle"
                        sub={claudeJudgeAllowed ? "Looks up the result with sources when it's due. Disputes still go to a vote." : "Only for public events with Claude connected."}
                      />
                    )}
                  </div>
                  {judgeMode === "person" && (
                    <div className="mt-3">
                      <PeoplePicker people={others.filter((m) => m.id !== subjectId && m.id !== opponentId)} value={judgeId} onChange={setJudgeId} />
                    </div>
                  )}
                </div>
              </div>
            </Step>
          )}

          {step === 4 && (
            <Step title={kind === "challenge" ? "Confirm your side" : "Your pick"} sub={kind === "challenge" ? undefined : "Put your money where your mouth is — or just host."}>
              <div className="space-y-6">
                {kind !== "challenge" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Choice on={joinNow} onClick={() => setJoinNow(true)} title="I'm in" sub="Take a side now." />
                    <Choice on={!joinNow} disabled={judgeMode === "person" && judgeId === me.id} onClick={() => setJoinNow(false)} title="Just hosting" sub="Post it and watch." />
                  </div>
                )}
                {(joinNow || kind === "challenge") && (
                  <>
                    {kind !== "challenge" && (
                      <div>
                        <FieldLabel done={myOption !== null} required>
                          {kind === "binary" ? "Your side: Yes or No?" : "Your pick"}
                        </FieldLabel>
                        <SidePicker
                          kind={kind!}
                          options={optionLabels.map((o, i) => ({ key: i, label: o }))}
                          value={myOption}
                          onChange={(k) => setMyOption(Number(k))}
                          isBlocked={(i) => kind === "binary" && subjectIsMe && i !== 0}
                        />
                      </div>
                    )}
                    {kind === "challenge" && (
                      <div className="surface p-4">
                        <p className="text-sm text-muted">Your task</p>
                        <p className="display text-2xl">{myTask}</p>
                      </div>
                    )}
                    {stakeMode === "money" && customStakes && kind !== "challenge" && (
                      <div>
                        <FieldLabel htmlFor="myamt" done={myAmount >= 100 && myAmount <= 1_000_000} required>
                          How much are you putting in?
                        </FieldLabel>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>
                          <input id="myamt" inputMode="decimal" className="input num pl-8 text-lg" value={myAmountText} onChange={(e) => setMyAmountText(e.target.value.replace(/[^\d.]/g, ""))} />
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="label mb-0">{kind === "challenge" ? "Chance you'll pull it off" : "How sure are you?"}</span>
                        <span className="num text-2xl font-semibold text-iris">{kind === "binary" ? Math.max(50, confidence) : confidence}%</span>
                      </div>
                      <input
                        type="range"
                        className="range"
                        min={kind === "binary" ? 50 : 1}
                        max={99}
                        value={kind === "binary" ? Math.max(50, confidence) : confidence}
                        onChange={(e) => setConfidence(Number(e.target.value))}
                        style={{ ["--pct" as string]: `${(((kind === "binary" ? Math.max(50, confidence) : confidence) - (kind === "binary" ? 50 : 1)) / (kind === "binary" ? 49 : 98)) * 100}%` }}
                      />
                      <p className="hint">Your confidence feeds your forecasting score. Calibration beats bravado.</p>
                    </div>
                    <div>
                      <label className="label" htmlFor="mynote">
                        Opening trash talk <span className="font-normal text-faint">(optional)</span>
                      </label>
                      <input id="mynote" className="input" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Screenshot this." />
                    </div>
                  </>
                )}
                <Summary
                  items={[
                    ["Group", group.name],
                    ["Bet", title],
                    ["Stakes", stakeMode === "money" ? (kind === "challenge" ? `${money(stakeCents)} to whoever succeeds` : customStakes ? `Pick your own (suggested ${money(stakeCents)})` : `${money(stakeCents)} each`) : "Bragging rights"],
                    ["Betting closes", fmt(closesAt)],
                    ["Result by", fmt(resolvesAt)],
                    ["Judge", judgeMode === "creator" ? "You" : judgeMode === "claude" ? "Claude" : firstName(others.find((o) => o.id === judgeId)?.name ?? "—")],
                    ...(effectivePublic && claudeOn ? ([["Claude", "Plays with a sealed pick"]] as [string, string][]) : []),
                  ]}
                />
              </div>
            </Step>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="sticky bottom-[calc(76px+var(--safe-bottom))] z-30 mt-8 lg:bottom-6">
        <div className="rounded-2xl border border-white/[0.08] bg-ink-900/85 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <button
            className="btn btn-primary btn-lg w-full"
            disabled={!canNext || pending}
            onClick={() => (last ? submit() : go(step + 1))}
          >
            {pending ? "Posting…" : problems[step] ? problems[step]!.replace(/\.$/, "") : last ? "Post bet" : "Continue"}{" "}
            {!pending && !last && !problems[step] && <ArrowRight className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ——— pieces ——— */

function Step({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="display text-[2.4rem] leading-none sm:text-[2.9rem]">{title}</h1>
      {sub && <p className="mt-2 text-muted">{sub}</p>}
      <div className="mt-7">{children}</div>
    </section>
  );
}

function KindCard({ on, onClick, icon, hue, title, example }: { on: boolean; onClick: () => void; icon: React.ReactNode; hue: number; title: string; example: string }) {
  return (
    <button
      onClick={onClick}
      className={`surface surface-hover flex items-center gap-4 p-5 text-left ${on ? "!border-iris/60" : ""}`}
      style={on ? { background: `linear-gradient(180deg, oklch(0.7 0.14 ${hue} / .14), oklch(0.7 0.14 ${hue} / .04))` } : undefined}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl" style={{ background: `oklch(0.78 0.13 ${hue} / .14)`, color: `oklch(0.84 0.12 ${hue})` }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.05rem] font-semibold">{title}</span>
        <span className="block text-sm text-muted">{example}</span>
      </span>
      <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${on ? "border-iris bg-iris text-ink-950" : "border-white/20"}`}>
        {on && <Check className="size-3.5" strokeWidth={3.5} />}
      </span>
    </button>
  );
}

function Choice({ on, onClick, icon, title, sub, disabled }: { on: boolean; onClick: () => void; icon?: React.ReactNode; title: string; sub: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl border p-4 text-left transition-all disabled:opacity-40 ${on ? "border-iris/60 bg-iris/10" : "border-white/[0.09] bg-white/[0.02] hover:bg-white/[0.05]"}`}
    >
      {icon && <span className={`mb-2 block ${on ? "text-iris" : "text-muted"}`}>{icon}</span>}
      <span className="block font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs leading-snug text-muted">{sub}</span>
    </button>
  );
}

function JudgeOption({ on, onClick, icon, title, sub, disabled }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-iris/60 bg-iris/10" : "border-white/[0.09] bg-white/[0.02] hover:bg-white/[0.05]"}`}
    >
      <span className="grid size-9 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${on ? "border-iris bg-iris text-ink-950" : "border-white/20"}`}>{on && <Check className="size-3" strokeWidth={3.5} />}</span>
    </button>
  );
}

function Toggle({ on, onChange, icon, title, sub }: { on: boolean; onChange: (v: boolean) => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button onClick={() => onChange(!on)} className={`flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition-all ${on ? "border-claude/40 bg-claude/[0.07]" : "border-white/[0.09] bg-white/[0.02]"}`} role="switch" aria-checked={on}>
      <span className={on ? "text-claude" : "text-muted"}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted">{sub}</span>
      </span>
      <span className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-claude" : "bg-white/15"}`}>
        <motion.span className="absolute top-0.5 size-5 rounded-full bg-white shadow" animate={{ left: on ? 18 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
      </span>
    </button>
  );
}

/** First names, plus a last initial wherever two people share a first name. */
function shortNames(people: Member[], meId?: string) {
  const counts = new Map<string, number>();
  for (const p of people) counts.set(firstName(p.name), (counts.get(firstName(p.name)) ?? 0) + 1);
  return new Map(
    people.map((p) => {
      if (p.id === meId) return [p.id, "Me"];
      const first = firstName(p.name);
      const last = p.name.trim().split(/\s+/).slice(1).pop();
      return [p.id, (counts.get(first) ?? 0) > 1 && last ? `${first} ${last[0]}.` : first];
    }),
  );
}

const SEARCH_FROM = 10;

/**
 * Pick one person. Chips wrap onto new lines, so nobody is hidden off the edge; a
 * filter appears for big groups; arrow keys move the choice like a radio group.
 */
function PeoplePicker({
  people,
  value,
  onChange,
  allowNone,
  noneLabel = "None",
  meId,
}: {
  people: Member[];
  value: string | null;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  meId?: string;
}) {
  const [query, setQuery] = useState("");
  const names = useMemo(() => shortNames(people, meId), [people, meId]);
  if (people.length === 0) return <p className="hint">Nobody else is in this group yet — invite some friends first.</p>;

  const q = query.trim().toLowerCase();
  const shown = q ? people.filter((p) => p.id === value || p.name.toLowerCase().includes(q) || names.get(p.id)!.toLowerCase().includes(q)) : people;
  // Everything you can land on with the arrow keys, in on-screen order.
  const keys: (string | null)[] = [...(allowNone ? [null] : []), ...shown.map((p) => p.id)];
  const focusable = keys.includes(value) ? value : keys[0];

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    const jump = e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : null;
    if (!step && jump === null) return;
    e.preventDefault();
    const at = Math.max(0, keys.indexOf(value));
    const next = keys[jump ?? (at + step + keys.length) % keys.length];
    onChange(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-key="${next ?? ""}"]`)?.focus();
  };

  const chip = (on: boolean) =>
    `flex h-11 items-center rounded-full border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/70 ${
      on ? "border-iris/60 bg-iris/10 text-fg" : "border-white/10 bg-white/[0.03] text-soft hover:bg-white/[0.07] hover:text-fg"
    }`;

  return (
    <div className="space-y-3">
      {people.length > SEARCH_FROM && (
        <input
          className="input !h-10 !text-sm"
          placeholder={`Find someone (${people.length} people)…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter people"
        />
      )}
      <div role="radiogroup" className="flex flex-wrap gap-2" onKeyDown={onKey}>
        {allowNone && (
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            tabIndex={focusable === null ? 0 : -1}
            data-key=""
            onClick={() => onChange(null)}
            className={`${chip(value === null)} px-4`}
          >
            {noneLabel}
          </button>
        )}
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={value === p.id}
            tabIndex={focusable === p.id ? 0 : -1}
            data-key={p.id}
            onClick={() => onChange(p.id)}
            title={p.name}
            className={`${chip(value === p.id)} gap-2 pl-1.5 pr-4`}
          >
            <Avatar user={p} size="sm" />
            {names.get(p.id)}
          </button>
        ))}
        {q && shown.length === 0 && <p className="hint self-center">Nobody matches “{query}”.</p>}
      </div>
    </div>
  );
}

function TimeField({ label, hint, value, presets, onChange }: { label: string; hint?: string; value: number; presets: { label: string; at: number }[]; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p.label} onClick={() => onChange(p.at)} className={`btn btn-sm ${Math.abs(p.at - value) < 60_000 ? "btn-light" : "btn-ghost"}`}>
            {p.label}
          </button>
        ))}
      </div>
      <input
        type="datetime-local"
        className="input num [color-scheme:dark]"
        value={toLocalInput(value)}
        onChange={(e) => {
          const t = new Date(e.target.value).getTime();
          if (!Number.isNaN(t)) onChange(t);
        }}
      />
      {hint && <p className="hint mt-1.5">{hint}</p>}
    </div>
  );
}

function Summary({ items }: { items: [string, string][] }) {
  return (
    <dl className="surface divide-y divide-white/[0.06] text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
          <dt className="shrink-0 text-muted">{k}</dt>
          <dd className="truncate text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

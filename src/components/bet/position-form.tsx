"use client";

import { useMemo, useState } from "react";
import { Check, LogOut } from "lucide-react";
import { motion } from "motion/react";
import { takePosition, withdrawPosition } from "@/lib/actions/bets";
import { money, parseDollars, signedMoney } from "@/lib/format";
import { useAction } from "../ui/use-action";
import { ConfirmButton } from "../ui/confirm-button";
import { optionColor } from "./palette";

export type PositionFormBet = {
  id: string;
  kind: "binary" | "multi" | "challenge";
  stakeMode: "money" | "bragging";
  stakeCents: number;
  customStakes: boolean;
  options: { id: string; label: string; pool: number; count: number }[];
  subjectIsViewer: boolean;
  opponentTaskSuggestion: string | null;
  mine: { optionId: string | null; amountCents: number; confidence: number; note: string | null; task: string | null } | null;
};

const QUICK = [500, 1000, 2000, 5000];

export function PositionForm({ bet }: { bet: PositionFormBet }) {
  const [pending, exec] = useAction();
  const mine = bet.mine;
  const [optionId, setOptionId] = useState<string | null>(mine?.optionId ?? null);
  const [amountText, setAmountText] = useState(((mine?.amountCents || bet.stakeCents || 1000) / 100).toString());
  const [confidence, setConfidence] = useState(mine?.confidence ?? (bet.kind === "multi" ? Math.min(90, Math.round(100 / Math.max(2, bet.options.length)) + 15) : 65));
  const [note, setNote] = useState(mine?.note ?? "");
  const [task, setTask] = useState(mine?.task ?? bet.opponentTaskSuggestion ?? "");

  const money_ = bet.stakeMode === "money";
  const amount = !money_ ? 0 : bet.customStakes ? (parseDollars(amountText) ?? 0) : bet.stakeCents;
  const minConf = bet.kind === "binary" ? 50 : 1;

  // Estimated profit if this pick wins, at the current pool (pari-mutuel).
  const estimate = useMemo(() => {
    if (!money_ || bet.kind === "challenge" || !optionId) return null;
    const pools = bet.options.map((o) => ({
      id: o.id,
      pool: o.pool - (mine && mine.optionId === o.id ? mine.amountCents : 0),
    }));
    const mineOn = pools.find((p) => p.id === optionId)!.pool + amount;
    const others = pools.filter((p) => p.id !== optionId).reduce((a, p) => a + p.pool, 0);
    if (mineOn <= 0) return null;
    return Math.floor((amount * others) / mineOn);
  }, [money_, bet.kind, bet.options, optionId, amount, mine]);

  const valid =
    (bet.kind === "challenge" ? task.trim().length > 0 : Boolean(optionId)) &&
    (!money_ || !bet.customStakes || (amount >= 100 && amount <= 1_000_000));

  const submit = () =>
    exec(
      () =>
        takePosition(bet.id, {
          optionId: bet.kind === "challenge" ? null : optionId,
          amountCents: amount,
          confidence: Math.max(minConf, confidence),
          note: note.trim() || null,
          task: bet.kind === "challenge" ? task.trim() : null,
        }),
      { success: mine ? "Position updated" : bet.kind === "challenge" ? "Challenge accepted. Game on." : "You're in." },
    );

  const selectedIndex = bet.options.findIndex((o) => o.id === optionId);
  const fill = bet.kind === "challenge" ? "#8e7dff" : selectedIndex >= 0 ? optionColor(bet.kind, selectedIndex) : "#8e7dff";

  return (
    <div className="space-y-5">
      {bet.kind !== "challenge" ? (
        <div>
          <p className="label">{mine ? "Your pick" : "Pick a side"}</p>
          <div className={bet.kind === "binary" ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
            {bet.options.map((o, i) => {
              const c = optionColor(bet.kind, i);
              const on = o.id === optionId;
              const blocked = bet.kind === "binary" && bet.subjectIsViewer && i !== 0;
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={blocked || pending}
                  onClick={() => setOptionId(o.id)}
                  title={blocked ? "You can't bet against yourself" : undefined}
                  className={`relative flex min-h-[52px] items-center justify-between gap-2 rounded-2xl border px-4 text-left font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                    on ? "scale-[1.01]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                  style={on ? { borderColor: c, background: `color-mix(in oklab, ${c} 16%, transparent)`, color: c, boxShadow: `0 8px 30px -14px ${c}` } : undefined}
                >
                  <span className="truncate">{o.label}</span>
                  {on && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="grid size-5 shrink-0 place-items-center rounded-full" style={{ background: c }}>
                      <Check className="size-3 text-ink-950" strokeWidth={3.5} />
                    </motion.span>
                  )}
                </button>
              );
            })}
          </div>
          {bet.subjectIsViewer && bet.kind === "binary" && (
            <p className="hint mt-2">This bet is about you, so you can only back yourself.</p>
          )}
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="task">
            Your side of the challenge
          </label>
          <input id="task" className="input" maxLength={200} value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. 50 unbroken push-ups" />
          <p className="hint mt-1.5">If you don&apos;t complete it and someone else does, you owe {money(bet.stakeCents)}.</p>
        </div>
      )}

      {money_ && bet.customStakes && bet.kind !== "challenge" && (
        <div>
          <label className="label" htmlFor="amt">
            Stake
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input
              id="amt"
              inputMode="decimal"
              className="input num pl-8 text-lg"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </div>
          <div className="mt-2 flex gap-1.5">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => setAmountText(String(q / 100))} className="btn btn-ghost btn-sm num flex-1 px-0">
                {money(q)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label className="label mb-0" htmlFor="conf">
            {bet.kind === "challenge" ? "Chance you'll pull it off" : "How sure are you?"}
          </label>
          <span className="num text-2xl font-semibold" style={{ color: fill }}>
            {Math.max(minConf, confidence)}%
          </span>
        </div>
        <input
          id="conf"
          type="range"
          min={minConf}
          max={99}
          value={Math.max(minConf, confidence)}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="range"
          style={{ ["--fill" as string]: fill, ["--pct" as string]: `${((Math.max(minConf, confidence) - minConf) / (99 - minConf)) * 100}%` }}
        />
        <p className="hint">Used for your forecasting score — be honest, not brave.</p>
      </div>

      <div>
        <label className="label" htmlFor="note">
          Trash talk <span className="font-normal text-faint">(optional)</span>
        </label>
        <input id="note" className="input" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say something you'll regret" />
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5 text-sm">
        {!money_ ? (
          <p className="text-muted">Bragging rights only — no money changes hands.</p>
        ) : bet.kind === "challenge" ? (
          <p className="text-muted">
            Stake <span className="num text-fg">{money(bet.stakeCents)}</span> · whoever fails pays whoever succeeds.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">
              You risk <span className="num text-fg">{money(amount)}</span>
            </span>
            <span className="text-muted">
              Win est.{" "}
              <span className="num font-semibold text-yes">{estimate === null ? "—" : estimate === 0 ? "$0 (no takers yet)" : signedMoney(estimate)}</span>
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={!valid || pending} className="btn btn-primary btn-lg flex-1">
          {pending ? "Saving…" : mine ? "Update position" : bet.kind === "challenge" ? "Accept challenge" : "Lock it in"}
        </button>
        {mine && (
          <ConfirmButton
            disabled={pending}
            onConfirm={() => exec(() => withdrawPosition(bet.id), { success: "You're out." })}
            className="btn btn-ghost btn-lg px-4"
            confirmLabel="Withdraw?"
          >
            <LogOut className="size-4" aria-label="Withdraw" />
          </ConfirmButton>
        )}
      </div>
      {money_ && bet.customStakes && bet.kind !== "challenge" && (
        <p className="hint text-center">Winners split the losers&apos; pot in proportion to their stakes.</p>
      )}
    </div>
  );
}

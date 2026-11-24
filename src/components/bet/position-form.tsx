"use client";

import { useMemo, useState } from "react";
import { Lock, LogOut } from "lucide-react";
import { takePosition, withdrawPosition } from "@/lib/actions/bets";
import { money, parseDollars, signedMoney } from "@/lib/format";
import { useAction } from "../ui/use-action";
import { ConfirmButton } from "../ui/confirm-button";
import { optionColor } from "./palette";
import { FieldLabel, SidePicker } from "../ui/form-bits";

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

  // Estimated profit if this pick wins, at the current pool: a pro-rata share of
  // the losing pot, capped at fair odds (see maxWinMultiple in engine/payout.ts).
  const estimate = useMemo(() => {
    if (!money_ || bet.kind === "challenge" || !optionId) return null;
    const pools = bet.options.map((o) => ({
      id: o.id,
      pool: o.pool - (mine && mine.optionId === o.id ? mine.amountCents : 0),
    }));
    const mineOn = pools.find((p) => p.id === optionId)!.pool + amount;
    const others = pools.filter((p) => p.id !== optionId).reduce((a, p) => a + p.pool, 0);
    if (mineOn <= 0) return null;
    const matched = Math.min(others, mineOn * Math.max(1, bet.options.length - 1));
    return Math.floor((amount * matched) / mineOn);
  }, [money_, bet.kind, bet.options, optionId, amount, mine]);

  // Yes/no: how much of your stake the other side has matched (the most you can lose).
  // The rest comes back to you whatever happens, unless more people take the other side.
  const matched = useMemo(() => {
    if (!money_ || bet.kind !== "binary" || !optionId || amount <= 0) return null;
    const pools = bet.options.map((o) => ({ id: o.id, pool: o.pool - (mine && mine.optionId === o.id ? mine.amountCents : 0) }));
    const mineOn = pools.find((p) => p.id === optionId)!.pool + amount;
    const others = pools.filter((p) => p.id !== optionId).reduce((a, p) => a + p.pool, 0);
    return Math.min(amount, Math.floor((amount * others) / mineOn));
  }, [money_, bet.kind, bet.options, optionId, amount, mine]);

  const sideDone = bet.kind === "challenge" ? task.trim().length > 0 : Boolean(optionId);
  const stakeDone = !money_ || !bet.customStakes || bet.kind === "challenge" || (amount >= 100 && amount <= 1_000_000);
  const valid = sideDone && stakeDone;
  const missing = !sideDone
    ? bet.kind === "challenge"
      ? "Describe your side to continue"
      : bet.kind === "binary"
        ? "Pick Yes or No to continue"
        : "Pick an option to continue"
    : !stakeDone
      ? "Enter a stake from $1 to $10,000"
      : null;
  const pickedLabel = bet.options.find((o) => o.id === optionId)?.label;

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
          <FieldLabel n={1} done={sideDone} required>
            {mine ? "Your pick" : bet.kind === "binary" ? "Pick Yes or No" : "Pick an option"}
          </FieldLabel>
          <SidePicker
            kind={bet.kind}
            options={bet.options.map((o) => ({ key: o.id, label: o.label }))}
            value={optionId}
            onChange={(k) => setOptionId(String(k))}
            isBlocked={(i) => bet.kind === "binary" && bet.subjectIsViewer && i !== 0}
            disabled={pending}
          />
          {bet.subjectIsViewer && bet.kind === "binary" && (
            <p className="hint mt-2">This bet is about you, so you can only back yourself.</p>
          )}
        </div>
      ) : (
        <div>
          <FieldLabel n={1} done={sideDone} required htmlFor="task">
            Your side of the challenge
          </FieldLabel>
          <input id="task" className="input" maxLength={200} value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. 50 unbroken push-ups" />
          <p className="hint mt-1.5">If you don&apos;t complete it and someone else does, you owe {money(bet.stakeCents)}.</p>
        </div>
      )}

      <div>
        {money_ && bet.customStakes && bet.kind !== "challenge" ? (
          <>
            <FieldLabel n={2} done={stakeDone} required htmlFor="amt">
              How much?
            </FieldLabel>
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
          </>
        ) : (
          <>
            <FieldLabel n={2} done>
              Stake
            </FieldLabel>
            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <Lock className="size-4 shrink-0 text-muted" />
              <span className="text-sm text-muted">
                {!money_ ? (
                  <>Bragging rights only. No money changes hands.</>
                ) : (
                  <>
                    <span className="num text-base font-semibold text-fg">{money(bet.stakeCents)}</span>{" "}
                    {bet.kind === "challenge" ? "to whoever succeeds, set by the creator." : "each, set by the creator."}
                  </>
                )}
              </span>
            </div>
          </>
        )}
      </div>

      <div>
        <FieldLabel
          n={3}
          done
          htmlFor="conf"
          aside={
            <span className="num text-2xl font-semibold" style={{ color: fill }}>
              {Math.max(minConf, confidence)}%
            </span>
          }
        >
          {bet.kind === "challenge" ? "Chance you'll pull it off" : "How sure are you?"}
        </FieldLabel>
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
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">
                You risk <span className="num text-fg">{money(matched ?? amount)}</span>
              </span>
              <span className="text-muted">
                Win est.{" "}
                <span className="num font-semibold text-yes">{estimate === null ? "—" : estimate === 0 ? "$0 (no takers yet)" : signedMoney(estimate)}</span>
              </span>
            </div>
            {matched !== null && matched < amount && (
              <div className="space-y-1.5">
                <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                  <div className="h-full bg-yes" style={{ width: `${(matched / amount) * 100}%` }} />
                  <div className="h-full flex-1 bg-[repeating-linear-gradient(135deg,rgb(255_255_255/.12)_0_6px,transparent_6px_12px)]" />
                </div>
                <p className="text-xs leading-snug text-muted">
                  {matched === 0 ? (
                    <>Nobody&apos;s on the other side yet. If nobody joins, everyone gets their stake back.</>
                  ) : (
                    <>
                      Only <span className="num text-fg">{money(matched)}</span> of your {money(amount)} is matched by the other side. The other{" "}
                      {money(amount - matched)} comes back to you either way, unless more people take the other side.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={!valid || pending} className="btn btn-primary btn-lg flex-1">
          {pending
            ? "Saving…"
            : missing
              ? missing
              : mine
                ? "Update position"
                : bet.kind === "challenge"
                  ? "Accept challenge"
                  : `Lock in ${pickedLabel}${money_ ? ` · ${money(amount)}` : ""}`}
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
        <p className="hint text-center">Winners split the losers&apos; pot in proportion to their stakes, up to fair odds.</p>
      )}
    </div>
  );
}

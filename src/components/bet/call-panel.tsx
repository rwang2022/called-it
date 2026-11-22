"use client";

import { useState } from "react";
import { Ban, Check, Gavel, X } from "lucide-react";
import { callBet } from "@/lib/actions/bets";
import type { Outcome } from "@/lib/db/schema";
import { useAction } from "../ui/use-action";
import { optionColor } from "./palette";

export type CallPanelProps = {
  betId: string;
  kind: "binary" | "multi" | "challenge";
  options: { id: string; label: string }[];
  participants: { positionId: string; name: string; task: string | null }[];
  early: boolean;
  revising: boolean;
  claudeFallback: boolean;
};

export function CallPanel(p: CallPanelProps) {
  const [pending, exec] = useAction();
  const [choice, setChoice] = useState<string | "void" | null>(null);
  const [results, setResults] = useState<Record<string, "pass" | "fail">>({});
  const [note, setNote] = useState("");

  const outcome: Outcome | null =
    choice === "void"
      ? { type: "void" }
      : p.kind === "challenge"
        ? p.participants.every((x) => results[x.positionId])
          ? { type: "challenge", results }
          : null
        : choice
          ? { type: "option", optionId: choice }
          : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
          <Gavel className="size-5" />
        </span>
        <div>
          <p className="font-semibold">{p.revising ? "Revise your call" : "You're the judge"}</p>
          <p className="hint">
            {p.claudeFallback
              ? "Claude couldn't settle this one, so it falls to you as creator. "
              : p.early
                ? "Calling it now closes betting immediately. "
                : ""}
            Participants get 24 hours to confirm or dispute.
          </p>
        </div>
      </div>

      {p.kind !== "challenge" ? (
        <div className="grid gap-2">
          {p.options.map((o, i) => {
            const c = optionColor(p.kind, i);
            const on = choice === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setChoice(o.id)}
                className={`flex h-12 items-center justify-between rounded-xl border px-4 font-semibold transition-all ${on ? "" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                style={on ? { borderColor: c, color: c, background: `color-mix(in oklab, ${c} 14%, transparent)` } : undefined}
              >
                {o.label} {on && <Check className="size-4" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {p.participants.map((x) => (
            <div key={x.positionId} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{x.name}</p>
                <p className="truncate text-xs text-muted">{x.task}</p>
              </div>
              {(["pass", "fail"] as const).map((r) => {
                const on = results[x.positionId] === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setChoice(null);
                      setResults((s) => ({ ...s, [x.positionId]: r }));
                    }}
                    className={`grid size-10 place-items-center rounded-xl border transition-all ${
                      on ? (r === "pass" ? "border-yes bg-yes/15 text-yes" : "border-no bg-no/15 text-no") : "border-white/10 text-faint hover:text-fg"
                    }`}
                    aria-label={`${x.name} ${r === "pass" ? "did it" : "failed"}`}
                  >
                    {r === "pass" ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setChoice("void")}
        className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors ${
          choice === "void" ? "border-white/30 bg-white/10 text-fg" : "border-dashed border-white/10 text-muted hover:text-fg"
        }`}
      >
        <Ban className="size-4" /> Void it — refund everyone
      </button>

      <textarea
        className="input"
        rows={2}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Evidence or reasoning (a link, a closing price, “video in the chat”)"
      />

      <button
        type="button"
        disabled={!outcome || pending}
        onClick={() => outcome && exec(() => callBet(p.betId, { outcome, note: note.trim() || null }), { success: "Call made. The 24h review window is open." })}
        className="btn btn-primary btn-lg w-full"
      >
        {pending ? "Submitting…" : "Make the call"}
      </button>
    </div>
  );
}

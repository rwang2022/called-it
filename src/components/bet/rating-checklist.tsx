"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { makeJudgeNeutral } from "@/lib/actions/bets";
import type { BetOutlook } from "@/lib/data/stats";
import { shortDuration } from "@/lib/format";
import { useAction } from "../ui/use-action";

/**
 * "Will this bet count?" on an open bet: the rating rules, checked live, so a
 * creator can fix a bet while there's still time instead of finding out after.
 */
export function RatingChecklist({
  betId,
  outlook,
  judgeName,
  canFix,
  claudeAllowed,
}: {
  betId: string;
  outlook: BetOutlook;
  judgeName: string;
  canFix: boolean;
  claudeAllowed: boolean;
}) {
  const [pending, exec] = useAction();
  const [picking, setPicking] = useState(false);
  const o = outlook;
  const people = o.neutralPeople;

  return (
    <section
      className="surface p-5"
      style={o.willCount ? undefined : { borderColor: "rgb(251 191 36 / .3)" }}
      aria-label="Will this bet count toward scores"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Will this count toward scores?</h2>
        <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide ${o.willCount ? "bg-yes/15 text-yes" : "bg-gold/15 text-gold"}`}>
          {o.willCount ? "On track" : "Not yet"}
        </span>
      </div>
      <ul className="space-y-2.5 text-sm">
        <Item ok={o.enoughForecasters}>
          {o.forecasters === 1 ? "1 person has" : `${o.forecasters} people have`} forecast it <span className="text-muted">(needs 2)</span>
          {o.newMembers > 0 && <span className="block text-xs text-muted">New members&apos; picks don&apos;t count in their first week.</span>}
        </Item>
        <Item ok={o.openLongEnough}>
          Betting {o.openLongEnough ? `stays open ${shortDuration(o.openMs)}` : `is only open ${shortDuration(o.openMs)}`} <span className="text-muted">(needs 1 hour)</span>
        </Item>
        {o.judgeHasStake && (
          <Item ok={false}>
            {judgeName} is judging <b>and</b> betting. If they call it their own way, their side only counts once someone on another side
            confirms, or the call survives a dispute vote.
          </Item>
        )}
      </ul>

      {canFix && o.judgeHasStake && (claudeAllowed || people.length > 0) && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {claudeAllowed && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pending}
                onClick={() => exec(() => makeJudgeNeutral(betId, { mode: "claude" }), { success: "Claude is judging now" })}
              >
                Hand judging to Claude
              </button>
            )}
            {people.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
                Pick a neutral judge
              </button>
            )}
          </div>
          {picking && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Neutral judges">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() =>
                    exec(() => makeJudgeNeutral(betId, { mode: "person", judgeId: p.id }), {
                      success: `${p.name.split(" ")[0]} is judging now`,
                      onDone: () => setPicking(false),
                    })
                  }
                >
                  {p.name.split(" ")[0]}
                </button>
              ))}
            </div>
          )}
          <p className="hint">Only you see these. You can move judging to someone with no stake, never the other way.</p>
        </div>
      )}
    </section>
  );
}

function Item({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <li className="flex items-start gap-2.5">
      <Icon className={`mt-0.5 size-4 shrink-0 ${ok ? "text-yes" : "text-gold"}`} aria-label={ok ? "Done" : "Needs attention"} />
      <span>{children}</span>
    </li>
  );
}

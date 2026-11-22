"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { reviewCall } from "@/lib/actions/bets";
import { useAction } from "../ui/use-action";

export function ReviewPanel({ betId, disputed }: { betId: string; disputed: boolean }) {
  const [pending, exec] = useAction();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");

  if (disputing) {
    return (
      <div className="space-y-3">
        <label className="label" htmlFor="reason">
          {disputed ? "Why should it be voided?" : "What's wrong with the call?"}
        </label>
        <textarea id="reason" className="input" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        <p className="hint">
          {disputed
            ? "Your vote counts toward voiding the bet (everyone refunded)."
            : "Disputing opens a 48-hour vote among participants: uphold the call, or void the bet and refund everyone."}
        </p>
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setDisputing(false)} disabled={pending}>
            Back
          </button>
          <button
            className="btn btn-no flex-1"
            disabled={pending || reason.trim().length === 0}
            onClick={() => exec(() => reviewCall(betId, { verdict: "dispute", reason: reason.trim() }), { success: disputed ? "Vote recorded." : "Dispute opened." })}
          >
            {disputed ? "Vote to void" : "Dispute"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        className="btn btn-yes btn-lg"
        disabled={pending}
        onClick={() => exec(() => reviewCall(betId, { verdict: "confirm", reason: null }), { success: disputed ? "Vote recorded." : "Confirmed. Thanks for being a good sport." })}
      >
        <ThumbsUp className="size-4" /> {disputed ? "Uphold" : "Confirm"}
      </button>
      <button className="btn btn-ghost btn-lg" disabled={pending} onClick={() => setDisputing(true)}>
        <ThumbsDown className="size-4" /> {disputed ? "Void" : "Dispute"}
      </button>
    </div>
  );
}

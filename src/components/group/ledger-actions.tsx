"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { cancelPayment, recordPayment, respondToPayment } from "@/lib/actions/payments";
import { money, parseDollars } from "@/lib/format";
import { useAction } from "../ui/use-action";

/** One-tap settle for a suggested transfer. The payer marks paid; the receiver records receipt. */
export function SettleButton({
  groupId,
  counterpartyId,
  amountCents,
  direction,
}: {
  groupId: string;
  counterpartyId: string;
  amountCents: number;
  direction: "paid" | "received";
}) {
  const [pending, exec] = useAction();
  return (
    <button
      className={`btn btn-sm ${direction === "paid" ? "btn-primary" : "btn-yes"}`}
      disabled={pending}
      onClick={() =>
        exec(() => recordPayment({ groupId, counterpartyId, direction, amountCents, note: null }), {
          success: direction === "paid" ? "Marked as paid — waiting for them to confirm." : "Recorded. Books updated.",
        })
      }
    >
      {direction === "paid" ? `I paid ${money(amountCents)}` : `Got ${money(amountCents)}`}
    </button>
  );
}

export function RespondButtons({ paymentId }: { paymentId: string }) {
  const [pending, exec] = useAction();
  return (
    <div className="flex gap-1.5">
      <button className="btn btn-yes btn-sm" disabled={pending} onClick={() => exec(() => respondToPayment(paymentId, true), { success: "Confirmed." })}>
        <Check className="size-4" /> Got it
      </button>
      <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => exec(() => respondToPayment(paymentId, false), { success: "Marked as not received." })} aria-label="Not received">
        <X className="size-4" />
      </button>
    </div>
  );
}

export function CancelPaymentButton({ paymentId }: { paymentId: string }) {
  const [pending, exec] = useAction();
  return (
    <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => exec(() => cancelPayment(paymentId), { success: "Cancelled." })}>
      Cancel
    </button>
  );
}

export function RecordPaymentForm({ groupId, people }: { groupId: string; people: { id: string; name: string }[] }) {
  const [pending, exec] = useAction();
  const [direction, setDirection] = useState<"paid" | "received">("paid");
  const [who, setWho] = useState(people[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const cents = parseDollars(amount);
  if (people.length === 0) return null;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!cents || !who) return;
        exec(() => recordPayment({ groupId, counterpartyId: who, direction, amountCents: cents, note: note.trim() || null }), {
          success: direction === "paid" ? "Recorded — they'll be asked to confirm." : "Recorded.",
          onDone: () => {
            setAmount("");
            setNote("");
          },
        });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        {(["paid", "received"] as const).map((d) => (
          <button key={d} type="button" onClick={() => setDirection(d)} className={`btn btn-sm ${direction === d ? "btn-light" : "btn-ghost"}`}>
            {d === "paid" ? "I paid someone" : "Someone paid me"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <select className="input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who">
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input className="input num pl-7" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Amount" />
        </div>
      </div>
      <input className="input" maxLength={140} placeholder="Note (e.g. Venmo)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn btn-primary w-full" disabled={pending || !cents}>
        Record payment
      </button>
    </form>
  );
}

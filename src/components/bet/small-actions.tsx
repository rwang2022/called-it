"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Send, Share2, Trash2 } from "lucide-react";
import confetti from "canvas-confetti";
import { addComment, askClaudeToCall, cancelBet, deleteComment } from "@/lib/actions/bets";
import { useAction } from "../ui/use-action";
import { ConfirmButton } from "../ui/confirm-button";
import { useToast } from "../ui/toast";
import { ClaudeGlyph } from "../ui/avatar";
import { SHARE_LINK_VERSION } from "@/lib/ticket-art";

export function ShareButton({ title }: { title: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        const url = `${window.location.origin}${window.location.pathname}?v=${SHARE_LINK_VERSION}`;
        if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
          try {
            await navigator.share({ title, url });
            return;
          } catch {
            /* user cancelled */
          }
        }
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success("Link copied. It previews the question; picks stay in the group.");
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
      Share
    </button>
  );
}

export function CancelBetButton({ betId }: { betId: string }) {
  const [pending, exec] = useAction();
  return (
    <ConfirmButton disabled={pending} className="btn btn-danger btn-sm" confirmLabel="Cancel this bet?" onConfirm={() => exec(() => cancelBet(betId), { success: "Bet cancelled." })}>
      Cancel bet
    </ConfirmButton>
  );
}

export function AskClaudeButton({ betId, label = "Ask Claude to call it now" }: { betId: string; label?: string }) {
  const [pending, exec] = useAction();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-ghost w-full gap-2.5"
      disabled={pending}
      onClick={() =>
        exec(() => askClaudeToCall(betId), {
          success: "Claude is researching — this takes about a minute.",
          onDone: () => setTimeout(() => router.refresh(), 6000),
        })
      }
    >
      <span className="inline-block size-4 shrink-0"><ClaudeGlyph /></span>
      {pending ? "Asking…" : label}
    </button>
  );
}

/** While Claude works in the background, quietly refresh so the result appears on its own. */
export function AutoRefresh({ everyMs = 5000, maxTimes = 24 }: { everyMs?: number; maxTimes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      if (++n > maxTimes) return clearInterval(id);
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, maxTimes]);
  return null;
}

export function CommentBox({ betId }: { betId: string }) {
  const [pending, exec] = useAction();
  const [body, setBody] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        exec(() => addComment(betId, body), { onDone: () => setBody("") });
      }}
    >
      <input className="input" maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Talk your talk…" />
      <button className="btn btn-primary h-12 w-12 shrink-0 px-0" disabled={pending || !body.trim()} aria-label="Send">
        <Send className="size-4" />
      </button>
    </form>
  );
}

export function DeleteCommentButton({ id }: { id: string }) {
  const [pending, exec] = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => exec(() => deleteComment(id))}
      className="text-faint opacity-0 transition-opacity hover:text-no group-hover:opacity-100"
      aria-label="Delete comment"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

/** Fires once per bet per device when the viewer won. */
export function WinConfetti({ betId }: { betId: string }) {
  useEffect(() => {
    const key = `confetti:${betId}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      /* storage blocked: celebrate anyway */
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#8e7dff", "#5ccbff", "#34d399", "#fbbf24", "#ffffff"];
    const fire = (x: number, angle: number) =>
      confetti({ particleCount: 70, spread: 70, startVelocity: 52, angle, origin: { x, y: 0.75 }, colors, ticks: 220, scalar: 1.05 });
    fire(0.1, 60);
    fire(0.9, 120);
    const t = setTimeout(() => confetti({ particleCount: 90, spread: 120, origin: { y: 0.4 }, colors }), 350);
    return () => clearTimeout(t);
  }, [betId]);
  return null;
}

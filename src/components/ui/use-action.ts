"use client";

import { useTransition } from "react";
import { useToast } from "./toast";

type Result = { ok: true; data?: unknown } | { ok: false; error: string } | undefined | void;

/** Run a server action inside a transition, surfacing failures as toasts. */
export function useAction() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const exec = (fn: () => Promise<Result>, opts: { success?: string; onDone?: () => void } = {}) =>
    start(async () => {
      try {
        const r = await fn();
        if (r && !r.ok) {
          toast.error(r.error);
          return;
        }
        if (opts.success) toast.success(opts.success);
        opts.onDone?.();
      } catch (e) {
        // Redirects surface as thrown navigation signals and are handled by Next.
        if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
        toast.error("Network hiccup — please try again.");
      }
    });
  return [pending, exec] as const;
}

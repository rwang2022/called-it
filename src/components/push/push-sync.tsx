"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncPushSubscription } from "@/lib/actions/push";
import { registerWorker, subscriptionJson } from "./client";

/**
 * Lives in the app shell. Keeps the service worker registered, checks that this
 * browser's push subscription belongs to whoever is signed in, refreshes the
 * page data when a push lands, and routes notification taps in-app.
 */
export function PushSync({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    registerWorker()
      .then(async (reg) => {
        const sub = await reg.pushManager?.getSubscription();
        if (sub) await syncPushSubscription(subscriptionJson(sub));
      })
      .catch(() => {});
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: unknown } | null;
      if (d?.type === "push") router.refresh();
      if (d?.type === "navigate" && typeof d.url === "string") {
        const u = new URL(d.url, window.location.origin);
        if (u.origin === window.location.origin) router.push(u.pathname + u.search + u.hash);
      }
    };
    sw.addEventListener("message", onMessage);
    return () => sw.removeEventListener("message", onMessage);
  }, [enabled, router]);
  return null;
}

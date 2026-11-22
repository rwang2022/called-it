"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Send, Share, SquarePlus } from "lucide-react";
import { sendTestPush, subscribePush, syncPushSubscription, unsubscribePush } from "@/lib/actions/push";
import { useToast } from "../ui/toast";
import { base64UrlToBytes, isIOS, pushSupport, registerWorker, sameKey, subscriptionJson } from "./client";

type Status = "checking" | "unconfigured" | "ios-install" | "unsupported" | "denied" | "off" | "on";

async function detect(publicKey: string | null): Promise<{ status: Status; devices: number }> {
  if (!publicKey) return { status: "unconfigured", devices: 0 };
  const support = pushSupport();
  if (support !== "supported") return { status: support, devices: 0 };
  if (Notification.permission === "denied") return { status: "denied", devices: 0 };
  const reg = await registerWorker();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { status: "off", devices: 0 };
  const res = await syncPushSubscription(subscriptionJson(sub));
  if (!res.ok || !res.data) return { status: "off", devices: 0 };
  return { status: res.data.on ? "on" : "off", devices: res.data.devices };
}

/** The profile page's "Notifications" card: a per-device on/off switch, plus a test button. */
export function NotificationSettings({ publicKey }: { publicKey: string | null }) {
  const toast = useToast();
  const [status, setStatus] = useState<Status>("checking");
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    detect(publicKey)
      .then((r) => {
        if (!live) return;
        setStatus(r.status);
        setDevices(r.devices);
      })
      .catch(() => live && setStatus("unsupported"));
    return () => {
      live = false;
    };
  }, [publicKey]);

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    try {
      // Ask first, straight from the tap: iOS only allows the prompt from a user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registerWorker();
      await navigator.serviceWorker.ready;
      const key = base64UrlToBytes(publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe(); // made with an old server key
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const res = await subscribePush(subscriptionJson(sub));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setStatus("on");
      setDevices((d) => Math.max(1, d + 1));
      toast.success("Notifications on for this device");
    } catch {
      toast.error("This browser wouldn't turn notifications on. Check its site settings.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const res = await unsubscribePush(sub.endpoint);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        await sub.unsubscribe().catch(() => {});
      }
      setStatus("off");
      setDevices((d) => Math.max(0, d - 1));
      toast.success("Notifications off for this device");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const res = await sendTestPush();
      if (res.ok) toast.success(res.data === 1 ? "Sent. Check your notifications." : `Sent to ${res.data} devices.`);
      else toast.error(res.error);
    } catch {
      toast.error("Network hiccup — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const switchable = status === "on" || status === "off";
  const others = status === "on" ? devices - 1 : devices;

  return (
    <section className="surface mt-6 p-5 sm:p-6" aria-labelledby="notifications-title">
      <div className="flex items-start gap-4">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${status === "on" ? "bg-iris/15 text-iris" : "bg-white/[0.05] text-muted"}`}
        >
          {status === "denied" || status === "unsupported" ? <BellOff className="size-5" /> : <Bell className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-7 items-center justify-between gap-3">
            <h2 id="notifications-title" className="font-semibold">
              Notifications
            </h2>
            {switchable && (
              <Switch
                checked={status === "on"}
                disabled={busy}
                onChange={(on) => (on ? turnOn() : turnOff())}
                label="Push notifications on this device"
              />
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted" aria-live="polite">
            {status === "checking" && "Checking this device…"}
            {status === "off" &&
              "Get a push when something needs you: a call to confirm or dispute, a vote, a challenge, a payment to confirm, or a bet you judge coming due. Plus your results and Claude's picks."}
            {status === "on" && (
              <>
                On for this device. You&apos;ll hear about calls, votes, challenges, payments, bets you judge, results and Claude&apos;s picks.
                {others > 0 && ` Also on ${others} other ${others === 1 ? "device" : "devices"}.`}
              </>
            )}
            {status === "denied" && "Notifications are blocked for this site. Allow them in your browser's site settings, then reload this page."}
            {status === "unsupported" &&
              (isIOSSafe() ? "Notifications need iOS 16.4 or later. Update your iPhone, then try again." : "This browser can't receive push notifications. Try Chrome, Edge, Firefox or Safari.")}
            {status === "unconfigured" && "Notifications aren't set up on this server yet."}
            {status === "ios-install" && "On iPhone and iPad, notifications work once Called It is on your Home Screen:"}
          </p>

          {status === "ios-install" && (
            <ol className="mt-3 space-y-2 text-sm text-soft">
              <Step n={1}>
                Tap <Share className="mx-0.5 inline size-4 -translate-y-px text-sky" aria-label="Share" /> Share in Safari&apos;s toolbar.
              </Step>
              <Step n={2}>
                Choose <SquarePlus className="mx-0.5 inline size-4 -translate-y-px text-sky" aria-hidden /> <b className="font-semibold">Add to Home Screen</b>.
              </Step>
              <Step n={3}>Open Called It from your Home Screen and turn notifications on here.</Step>
            </ol>
          )}

          {status === "unconfigured" && process.env.NODE_ENV === "development" && (
            <p className="hint mt-2">
              Dev: run <code className="num text-soft">npm run push:keys</code>, then restart the dev server.
            </p>
          )}

          {status === "on" && (
            <button type="button" onClick={test} disabled={busy} className="btn btn-ghost btn-sm mt-4">
              <Send className="size-3.5" /> Send a test
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

const isIOSSafe = () => typeof navigator !== "undefined" && isIOS();

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[11px] font-semibold text-muted">{n}</span>
      <span>{children}</span>
    </li>
  );
}

function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:cursor-wait disabled:opacity-60 ${
        checked ? "border-transparent bg-iris" : "border-white/10 bg-white/[0.08]"
      }`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-white shadow-md shadow-black/40 transition-transform duration-200 ${checked ? "translate-x-[23px]" : "translate-x-[3px]"}`}
      />
    </button>
  );
}

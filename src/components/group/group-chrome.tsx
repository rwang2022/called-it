"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { useToast } from "../ui/toast";

export function GroupTabs({ groupId, hue }: { groupId: string; hue?: number }) {
  const path = usePathname();
  const base = `/g/${groupId}`;
  const tabs = [
    { href: base, label: "Bets" },
    { href: `${base}/leaderboard`, label: "Leaderboard" },
    { href: `${base}/ledger`, label: "Settle up" },
    { href: `${base}/members`, label: "Members" },
  ];
  return (
    <nav className="scrollbar-none -mx-4 mb-7 flex gap-1 overflow-x-auto border-b border-white/[0.07] px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => {
        const on = t.href === base ? path === base : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative shrink-0 px-3.5 pb-3 pt-1 text-[0.93rem] font-medium transition-colors ${on ? "text-fg" : "text-muted hover:text-fg"}`}
          >
            {t.label}
            {on && (
              <span
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                style={{
                  background:
                    hue === undefined
                      ? "linear-gradient(90deg, var(--color-iris), var(--color-sky))"
                      : `linear-gradient(90deg, oklch(0.82 0.13 ${hue}), oklch(0.72 0.15 ${(hue + 40) % 360}))`,
                  boxShadow: hue === undefined ? undefined : `0 0 12px oklch(0.75 0.15 ${hue} / 0.6)`,
                }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function CopyInvite({ code, compact = false }: { code: string; compact?: boolean }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const copy = async () => {
    const url = `${window.location.origin}/join/${code}`;
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: "Join my group on Called It", url });
        return;
      }
    } catch {
      return;
    }
    await navigator.clipboard.writeText(url);
    setDone(true);
    toast.success("Invite link copied. Drop it in the group chat.");
    setTimeout(() => setDone(false), 2000);
  };
  return (
    <button type="button" onClick={copy} className={compact ? "btn btn-ghost btn-sm" : "btn btn-light"}>
      {done ? <Check className="size-4" /> : <Link2 className="size-4" />} Invite
    </button>
  );
}

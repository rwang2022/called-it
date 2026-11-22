"use client";

import { useEffect, useState } from "react";
import { Avatar, type AvatarUser } from "../ui/avatar";

const HEARTBEAT_MS = 60_000;
const ONLINE_MS = 2 * 60_000;
const POLL_MS = 30_000;

const isOnline = (lastSeenAt: number | null, now: number) => lastSeenAt != null && now - lastSeenAt < ONLINE_MS;

/** Tells the server "I have the app open" every minute, but only while this tab is visible. */
export function PresenceHeartbeat() {
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body: "{}", keepalive: true }).catch(() => {});
    };
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
  return null;
}

/** A green dot for the corner of an avatar. */
export function OnlineDot({ className = "" }: { className?: string }) {
  return (
    <span
      className={`absolute bottom-0 right-0 block size-2.5 rounded-full bg-yes ring-2 ring-ink-900 ${className}`}
      aria-hidden
    />
  );
}

type Member = AvatarUser & { lastSeenAt: number | null };

/** "Sam and Priya are here": who else in the group has the app open, refreshed every 30s. */
export function OnlineNow({ groupId, viewerId, members: initial, serverNow }: { groupId: string; viewerId: string; members: Member[]; serverNow: number }) {
  const [members, setMembers] = useState(initial);
  // Start from the server's clock so the first client render matches the HTML.
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/presence?group=${encodeURIComponent(groupId)}`, { cache: "no-store" });
        if (!res.ok || !live) return;
        const seen = new Map((await res.json() as { id: string; lastSeenAt: number | null }[]).map((r) => [r.id, r.lastSeenAt]));
        setMembers((ms) => ms.map((m) => (seen.has(m.id) ? { ...m, lastSeenAt: seen.get(m.id) ?? null } : m)));
      } catch {}
      if (live) setNow(Date.now());
    };
    const t = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      live = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [groupId]);

  const here = members.filter((m) => m.id !== viewerId && !m.isBot && isOnline(m.lastSeenAt, now));
  if (here.length === 0) return <span className="text-faint">· nobody else online</span>;
  const names = here.map((m) => m.name.split(" ")[0]);
  const label =
    names.length === 1 ? `${names[0]} is online` : names.length === 2 ? `${names[0]} and ${names[1]} are online` : `${names[0]}, ${names[1]} and ${names.length - 2} more online`;
  return (
    <span className="inline-flex items-center gap-2" title={here.map((m) => m.name).join(", ")}>
      <span className="relative inline-flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-yes opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-yes" />
      </span>
      <span className="inline-flex items-center">
        {here.slice(0, 4).map((m, i) => (
          <span key={m.id} className={i === 0 ? "" : "-ml-1.5"}>
            <Avatar user={m} size="xs" ring />
          </span>
        ))}
      </span>
      <span className="text-soft">{label}</span>
    </span>
  );
}

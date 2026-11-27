"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Inbox, LogOut, Plus, UserRound, Users } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { Avatar, type AvatarUser } from "../ui/avatar";
import { Logo } from "../ui/logo";
import { GroupMonogram } from "../ui/slip";

type NavGroup = { id: string; name: string; hue: number };

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/home" ? path === "/home" : path === href || path.startsWith(`${href}/`));
}

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="num grid h-[18px] min-w-[18px] place-items-center rounded-full bg-no px-1 text-[10px] font-bold text-white shadow-[0_0_12px_rgba(251,113,133,.6)]">
      {n > 9 ? "9+" : n}
    </span>
  );
}

export function Sidebar({ user, groups, inbox }: { user: AvatarUser; groups: NavGroup[]; inbox: number }) {
  const active = useActive();
  const item = (href: string, label: string, Icon: typeof House, badge?: number) => (
    <Link
      href={href}
      className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[0.93rem] font-medium transition-colors ${
        active(href) ? "bg-white/[0.08] text-fg" : "text-muted hover:bg-white/[0.04] hover:text-fg"
      }`}
    >
      <Icon className="size-[18px]" />
      <span className="flex-1">{label}</span>
      {badge ? <Badge n={badge} /> : null}
    </Link>
  );
  return (
    <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r border-white/[0.06] bg-ink-950/40 px-4 py-6 backdrop-blur-xl lg:flex">
      <Link href="/home" className="mb-8 px-2">
        <Logo />
      </Link>
      <Link href="/bets/new" className="btn btn-primary mb-6 w-full">
        <Plus className="size-4" strokeWidth={2.6} /> New bet
      </Link>
      <nav className="space-y-1">
        {item("/home", "Home", House)}
        {item("/inbox", "Inbox", Inbox, inbox)}
        {item(`/u/${user.id}`, "Profile", UserRound)}
      </nav>
      <div className="mb-2 mt-8 flex items-center justify-between px-3">
        <span className="eyebrow">Groups</span>
        <Link href="/groups/new" className="text-faint transition-colors hover:text-fg" aria-label="New group">
          <Plus className="size-4" />
        </Link>
      </div>
      <nav className="scrollbar-none -mx-1 flex-1 space-y-0.5 overflow-y-auto px-1">
        {groups.map((g) => (
          <Link
            key={g.id}
            href={`/g/${g.id}`}
            className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[0.93rem] transition-colors ${
              active(`/g/${g.id}`) ? "bg-white/[0.08] text-fg" : "text-muted hover:bg-white/[0.04] hover:text-fg"
            }`}
          >
            <GroupMonogram name={g.name} hue={g.hue} className="size-6 rounded-lg text-[0.95rem]" />
            <span className="truncate">{g.name}</span>
          </Link>
        ))}
        {groups.length === 0 && <p className="px-3 text-sm text-faint">No groups yet.</p>}
      </nav>
      <Link href="/how-it-works" className="mb-2 mt-4 px-3 text-xs text-faint transition-colors hover:text-muted">
        How it works · house rules
      </Link>
      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2.5">
        <Avatar user={user} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <Link href={`/u/${user.id}`} className="text-xs text-muted hover:text-fg">
            View stats
          </Link>
        </div>
        <form action={signOut}>
          <button className="grid size-9 place-items-center rounded-xl text-faint transition-colors hover:bg-white/5 hover:text-fg" aria-label="Sign out" title="Sign out">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}

export function BottomNav({ userId, inbox }: { userId: string; inbox: number }) {
  const active = useActive();
  const tab = (href: string, label: string, Icon: typeof House, badge = 0) => (
    <Link
      href={href}
      className={`relative flex flex-1 flex-col items-center justify-center gap-1 pt-2 text-[10.5px] font-semibold transition-colors ${
        active(href) ? "text-fg" : "text-faint"
      }`}
    >
      <span className="relative">
        <Icon className="size-[22px]" strokeWidth={active(href) ? 2.4 : 2} />
        {badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5">
            <Badge n={badge} />
          </span>
        )}
      </span>
      {label}
    </Link>
  );
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.07] bg-ink-950/80 backdrop-blur-2xl lg:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div className="mx-auto flex h-[62px] max-w-lg items-stretch px-2">
        {tab("/home", "Home", House)}
        {tab("/groups", "Groups", Users)}
        <div className="flex flex-1 items-center justify-center">
          <Link
            href="/bets/new"
            aria-label="New bet"
            className="grid size-12 -translate-y-3 place-items-center rounded-2xl bg-gradient-to-b from-[#b3a8ff] to-iris text-ink-950 shadow-[0_10px_30px_-6px_rgba(142,125,255,.8)] ring-4 ring-ink-950 transition-transform active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.8} />
          </Link>
        </div>
        {tab("/inbox", "Inbox", Inbox, inbox)}
        {tab(`/u/${userId}`, "You", UserRound)}
      </div>
    </nav>
  );
}

export function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.05] bg-ink-950/70 px-4 backdrop-blur-2xl lg:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <Link href="/home">
        <Logo />
      </Link>
    </header>
  );
}

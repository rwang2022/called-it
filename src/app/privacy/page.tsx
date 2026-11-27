import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { APP_NAME } from "@/lib/brand";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <Link href="/" className="mb-14 inline-block animate-fade">
        <Logo />
      </Link>
      <p className="eyebrow mb-4">The fine print</p>
      <h1 className="display mb-8 text-[3.4rem] leading-[0.95] sm:text-6xl">
        Privacy<span className="text-gold">.</span>
      </h1>
      <div className="space-y-5 leading-relaxed text-soft [&_h2]:mt-12 [&_h2]:border-t [&_h2]:border-white/[0.08] [&_h2]:pt-8 [&_h2]:font-display [&_h2]:text-[1.75rem] [&_h2]:font-normal [&_h2]:leading-tight [&_h2]:tracking-[-0.015em] [&_h2]:text-fg">
        <p>{APP_NAME} is a small app for friends to make bets and predictions with each other. Here is exactly what it does with your data.</p>
        <h2>What we store</h2>
        <p>
          When you sign in with Google we receive your name, email address and profile picture. If you use a username instead, we store that username and a salted scrypt hash of your password (never the password itself). If you upload a profile photo, we store a small 256px copy; removing it deletes it. While the app is open on your screen, we record when you were last active, so people in your groups can see who&apos;s online. Only members of groups you share can see it. We store those, plus what you do in the app: groups
          you join, bets you create, positions, comments, calls, votes and payments you record.
        </p>
        <h2>Who can see it</h2>
        <p>
          Everything you do lives inside groups. Only members of a group can see its bets, ledger and leaderboard. Your profile stats are only
          visible to people who share a group with you, and only include bets from those shared groups. Your email address is never shown to
          other users.
        </p>
        <p>
          Shared links are the one exception. Anyone with a bet&apos;s link, including the chat app that builds its preview, can see the
          bet&apos;s question, its group&apos;s name and whether betting is open. Anyone with an invite link can see the group&apos;s name and how
          many members it has. Who&apos;s in, their picks, stakes and comments stay members-only.
        </p>
        <h2>Notifications</h2>
        <p>
          If you turn on notifications, we store the push address your browser gives us (an opaque link to Google&apos;s, Apple&apos;s,
          Mozilla&apos;s or Microsoft&apos;s push service) for that device. Alerts include things like bet titles, first names and amounts,
          and are encrypted so the push service can&apos;t read them. Turn them off on your profile at any time; signing out turns them off for
          that device.
        </p>
        <h2>Claude</h2>
        <p>
          For bets marked as public events, the bet&apos;s question, details and options are sent to Anthropic&apos;s API so Claude can research
          and make a pick or determine the outcome. Personal bets, names, emails, comments and positions are never sent.
        </p>
        <h2>Money</h2>
        <p>{APP_NAME} never holds, moves or processes money. The ledger is a record you and your friends keep; settle up however you like.</p>
        <h2>Deleting your data</h2>
        <p>Ask the person who runs this instance to delete your account. Leaving a group removes you from it once your bets there are settled.</p>
      </div>
    </div>
  );
}

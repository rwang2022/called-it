"use client";

import { useState } from "react";
import { Check, KeyRound } from "lucide-react";
import { setPassword } from "@/lib/actions/password";
import { useAction } from "../ui/use-action";
import { GoogleG } from "./google-g";

type Props = {
  username: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
  googleAvailable: boolean;
  error?: string | null;
};

const PASSWORD_MIN = 10;

/** The profile page's "Sign-in" card: Google link status, plus username and password. */
export function SignInMethods(props: Props) {
  const [pending, exec] = useAction();
  const [username, setUsername] = useState(props.username);
  const [hasPassword, setHasPassword] = useState(props.hasPassword);
  const [editing, setEditing] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [current, setCurrent] = useState("");
  const [password, setPw] = useState("");
  // The server accepts no current password only right after a sign-in (that's the forgot-password path).
  const needsCurrent = hasPassword;
  const ready = password.length >= PASSWORD_MIN && Boolean(username || newUsername.trim().length >= 3);

  return (
    <section className="surface mt-6 p-5 sm:p-6">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <KeyRound className="size-4 text-muted" /> Sign-in
      </h2>
      <p className="mb-5 text-sm text-muted">Ways you can get into this account.</p>

      {props.error && (
        <p role="alert" className="mb-4 rounded-2xl border border-no/30 bg-no/10 px-4 py-3 text-sm text-[#fecdd3]">
          {props.error}
        </p>
      )}

      <ul className="divide-y divide-white/[0.06]">
        <li className="flex items-center justify-between gap-4 py-3">
          <span className="flex items-center gap-3 text-sm">
            <GoogleG /> Google
          </span>
          {props.hasGoogle ? (
            <span className="flex items-center gap-1.5 text-sm text-yes"><Check className="size-4" /> Connected</span>
          ) : props.googleAvailable ? (
            <a href="/api/auth/google?link=1" className="btn btn-ghost btn-sm">Connect</a>
          ) : (
            <span className="text-sm text-faint">Unavailable</span>
          )}
        </li>
        <li className="flex items-center justify-between gap-4 py-3">
          <span className="text-sm">
            Username &amp; password
            {username && <span className="ml-2 font-mono text-muted">@{username}</span>}
          </span>
          {!editing && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              {hasPassword ? "Change password" : "Set up"}
            </button>
          )}
        </li>
      </ul>

      {editing && (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            exec(
              async () => {
                const r = await setPassword({ username: username ? undefined : newUsername, current: needsCurrent && current ? current : undefined, password });
                if (r.ok && r.data) {
                  setUsername(r.data.username);
                  setHasPassword(true);
                }
                return r;
              },
              {
                success: "Password saved. Other devices were signed out.",
                onDone: () => {
                  setEditing(false);
                  setCurrent("");
                  setPw("");
                },
              },
            );
          }}
        >
          {/* Lets password managers file the new password under the right username. */}
          {username && <input type="hidden" name="username" autoComplete="username" value={username} readOnly />}
          {!username && (
            <div>
              <label className="label" htmlFor="sm-username">Username</label>
              <input
                id="sm-username"
                className="input"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={24}
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
              <p className="hint mt-1.5">3–24 letters, numbers, dots or underscores. This can&apos;t be changed later.</p>
            </div>
          )}
          {needsCurrent && (
            <div>
              <label className="label" htmlFor="sm-current">Current password</label>
              <input id="sm-current" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
              {props.hasGoogle && <p className="hint mt-1.5">Forgot it? Sign out, sign back in with Google, then leave this blank.</p>}
            </div>
          )}
          <div>
            <label className="label" htmlFor="sm-new">{hasPassword ? "New password" : "Password"}</label>
            <input id="sm-new" className="input" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={200} value={password} onChange={(e) => setPw(e.target.value)} />
            <p className="hint mt-1.5">At least {PASSWORD_MIN} characters. Saving signs out your other devices.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={pending || !ready}>{pending ? "Saving…" : "Save"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
      {!props.hasGoogle && hasPassword && (
        <p className="hint mt-4">Connect Google so you can get back in if you forget your password.</p>
      )}
    </section>
  );
}

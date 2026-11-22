"use client";

import { useState } from "react";
import { signInWithPassword, signUpWithPassword } from "@/lib/actions/password";
import { useAction } from "../ui/use-action";

const PASSWORD_MIN = 10;

/** Username + password sign-in, with a toggle to create an account instead. */
export function PasswordForm({ next, initialMode = "signin" }: { next: string; initialMode?: "signin" | "signup" }) {
  const [pending, exec] = useAction();
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const signup = mode === "signup";
  const ready = username.trim().length >= 3 && password.length >= (signup ? PASSWORD_MIN : 1) && (!signup || name.trim().length > 0);

  return (
    <form
      className="space-y-4 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => (signup ? signUpWithPassword({ username, name, password, next }) : signInWithPassword({ username, password, next })));
      }}
    >
      <div>
        <label className="label" htmlFor="pw-username">Username</label>
        <input
          id="pw-username"
          className="input"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={24}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      {signup && (
        <div>
          <label className="label" htmlFor="pw-name">Your name</label>
          <input id="pw-name" className="input" name="name" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
          <p className="hint mt-1.5">What friends see on bets and leaderboards.</p>
        </div>
      )}
      <div>
        <label className="label" htmlFor="pw-password">Password</label>
        <input
          id="pw-password"
          className="input"
          type="password"
          name="password"
          autoComplete={signup ? "new-password" : "current-password"}
          minLength={signup ? PASSWORD_MIN : undefined}
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {signup && <p className="hint mt-1.5">At least {PASSWORD_MIN} characters. A password manager&apos;s suggestion is perfect.</p>}
      </div>
      <button className="btn btn-primary btn-lg w-full" disabled={pending || !ready}>
        {pending ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted">
        {signup ? "Already have an account? " : "New here? "}
        <button type="button" className="font-medium text-fg underline-offset-4 hover:underline" onClick={() => setMode(signup ? "signin" : "signup")}>
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
}

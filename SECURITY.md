# Security

Called It is a scoreboard and IOU tracker for friend groups. It never holds or moves money, so the assets worth protecting are accounts, who's in which group, what people bet and said, and the integrity of results. This page describes how each is protected and points at the code that does it, so you can check for yourself.

## Reporting a problem

Please open a private report via **GitHub → Security → Report a vulnerability** on this repository, rather than a public issue. Include steps to reproduce. You'll get a reply within a few days.

## Accounts and sessions

| What | How | Code |
|---|---|---|
| Google sign-in | OAuth 2.0 code flow with PKCE and a `state` check (Arctic). The ID token comes straight from Google's token endpoint over TLS; issuer, audience, expiry and `email_verified` are still checked. | `src/app/api/auth/google/` |
| Password sign-in | Passwords hashed with scrypt (N=2^16, r=8, p=2, 16-byte random salt, parameters stored per hash), compared in constant time. Unknown usernames still run one scrypt so timing doesn't reveal which usernames exist. Minimum 10 characters. | `src/lib/auth/password.ts`, `src/lib/actions/password.ts` |
| Guessing | After 8 failures for a username, or 40 from one IP, in 15 minutes, sign-in is refused for the rest of the window. New accounts are capped at 10 per IP per 15 minutes. | `throttled` / `recordFailure` in `src/lib/auth/password.ts` |
| Adding a way in | Setting or changing a password, or connecting Google, needs the current password or a sign-in from the last 15 minutes, so a briefly borrowed session can't add a backdoor. Changing a password signs out every other device. A Google account already tied to another user is never merged. | `setPassword`, `linkGoogleUser`, `isRecentSignIn` |
| Sessions | 160-bit random tokens. Only their SHA-256 hash is stored, so a database leak doesn't yield usable sessions. Cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, 30-day sliding expiry. Signing out deletes the session and that device's push subscription. | `src/lib/auth/session.ts` |
| Dev login | The demo-user sign-in only exists when `NODE_ENV=development`. | `src/app/api/auth/dev/route.ts` |

## Authorization

- Every page and server action re-checks group membership next to the data it reads or writes (`actionMember`, `loadBetForMember`, `membership`). The proxy redirect (`src/proxy.ts`) is a convenience only, not a security boundary.
- Non-members get a 404, not a 403, so group and bet ids don't leak. Profiles only show stats from groups you share.
- Bet rules (no betting against yourself, neutral judges can't bet, terms locked once others join, who may call, review and dispute) are enforced server-side in the pure, unit-tested state machine at `src/lib/engine/rules.ts`.
- Claude's pick on a bet stays on the server until betting closes. The data layer replaces it with `{ state: "sealed" }` and strips Claude's note (`src/lib/data/bets.ts`).
- "Who's online" only shows people in groups you share. The heartbeat (`POST /api/presence`) needs a session and a JSON content type, so other sites can't trigger it, and the lookup (`GET /api/presence?group=`) checks membership and returns only member ids and last-seen times (`src/lib/presence.ts`).
- Payments need the receiver's confirmation, and only the receiver can confirm (`src/lib/actions/payments.ts`).

## Inputs and output

- All server action inputs are validated with zod. All database access goes through Drizzle's parameterized queries; there is no raw SQL built from strings.
- No `dangerouslySetInnerHTML`. React escapes everything users write.
- Profile photo uploads are resized to 256px in the browser, capped at 300 KB on the server, and identified by their bytes (JPEG, PNG or WebP only), not the type the browser claims. They're served with `nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`, so a disguised file can never run as a page (`src/lib/actions/profile.ts`, `src/app/api/avatar/`).
- Links that Claude cites are restricted to `http(s)://` and open with `rel="noopener noreferrer nofollow"`.
- Post-login redirects only accept same-site relative paths (`safeNext`).
- Server actions are protected against CSRF by Next.js's Origin check. The one JSON route (`/api/push/resubscribe`) requires `application/json`, which a cross-site form can't send, plus the `SameSite=Lax` session cookie.
- **Content Security Policy (strict, nonce-based).** Every page response carries a fresh random nonce, and scripts only run if they carry it or were loaded by one that does (`'strict-dynamic'`). An injected `<script>` or inline handler like `onerror=` is refused by the browser even if some bug let it into the page. There's no `'unsafe-inline'` or `'unsafe-eval'` for scripts in production. Inline *styles* are allowed, since they can't run code. Images are limited to this site and Google profile pictures, and framing, `<base>`, plugins and off-site form posts are blocked. Pages are rendered per request so each gets its own nonce (`src/proxy.ts`, `src/app/layout.tsx`).
- Other headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. Non-page responses (API routes, icons) get a baseline CSP from `next.config.ts`, and the service worker gets a strict same-origin one.

## Outbound requests

- Web Push subscriptions are only accepted for the browsers' own push services (Google, Mozilla, Apple, Microsoft hosts, HTTPS only), so the server can't be made to send requests to arbitrary URLs. Payloads are end-to-end encrypted by the Web Push protocol (`src/lib/actions/push.ts`).
- Only public-event bet text is sent to Anthropic. Personal bets, names, emails and comments never are. Claude's answers are parsed through a strict schema. Claude calls are claimed atomically, so they're never double-run, and capped per group per day (`src/lib/claude/`).
- `/api/cron` requires `Authorization: Bearer $CRON_SECRET`, compared in constant time.

## Secrets

No secrets are in this repository or its history. They live in the hosting provider's environment variables: database URL and token, Google client secret, Anthropic key, VAPID private key, cron secret. `.env*` files are git-ignored, and `.env.example` holds only local defaults.

## Known limits

- The only recovery for a forgotten password is signing in with a connected Google account. Accounts with no Google link and no password can't be recovered. There's no email reset.
- Usernames are visible to the sign-up form ("That username is taken"), as on most sites.
- Rate limits key on the client IP that Vercel reports. Someone with many IPs can spread guesses, but per-username limits still apply.
- Whoever runs the deployment can read the database. Bets and comments aren't end-to-end encrypted.

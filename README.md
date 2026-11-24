# Called It

Bets and predictions between friends, with honest track records, fair judging, and Claude at the table.

- **Any kind of bet:** yes/no, multiple choice, or head-to-head challenges ("you do X, I do Y, whoever can't pays"), with any number of people on each side.
- **Fair by design:** neutral judges, a 24h review window, majority-vote disputes, no betting against yourself, and terms that can't change after posting.
- **Scored like forecasters:** every pick carries a confidence. Leaderboards rank by edge: how much better your Brier score was than everyone else's on the same bets, so calling sure things or farming friends earns nothing. Only rated bets count (no solo bets, no unconfirmed self-judging). Also calibration curves, category breakdowns, head-to-heads, streaks, and judge reputations.
- **Claude plays:** on public events Claude researches the web and locks in a sealed pick (revealed when betting closes). It can also act as the oracle and call the result, with sources.
- **Settle up:** money bets roll into a per-group ledger that computes the fewest payments needed. The receiver confirms every payment. No money ever moves through the app.
- **Notifications:** Web Push tells people when something needs them (a call to confirm, a dispute vote, a challenge, a payment to confirm, a bet they judge coming due) and when their bets settle or Claude's pick is revealed.

Stack: Next.js 16 (App Router, server actions), React 19, Tailwind v4, Drizzle ORM on libSQL (SQLite file locally, Turso in production), Google OAuth via Arctic or username + password (scrypt) with hashed DB sessions, and the Anthropic SDK (Claude Opus 5.5 + web search).

The security model, and how to report a problem, are in [SECURITY.md](SECURITY.md).

---

## Run it locally (2 minutes, no accounts needed)

```bash
npm install
cp .env.example .env.local      # defaults work for local dev
npm run db:reset                # creates local.db, migrates, seeds demo data
npm run dev                     # http://localhost:3000
```

On the landing page, **"Local dev · sign in as a demo friend"** logs you in as one of six seeded friends (Alex, Sam, Jo, Priya, Ben, Maya). The seed includes settled history, live bets, a bet awaiting a call, one under review, one in a dispute vote, and a pending payment, so every screen has something on it. This dev login only exists under `next dev`.

To try the Claude flow without an API key, set `CLAUDE_MOCK=1` in `.env.local` (dev only). For real research-backed picks, set `ANTHROPIC_API_KEY`.

To try notifications locally (Chrome, Edge or Firefox; `localhost` counts as a secure origin, so no HTTPS needed):

```bash
npm run push:keys               # writes VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to .env.local
npm run dev                     # restart if it was already running
```

Sign in as a demo friend, open **Profile**, flip **Notifications** on and press **Send a test**. Then:

- **Clock-driven:** sign in as **Alex**, turn notifications on, and open **Home**. Alex judges the seeded bet that's awaiting a call (Priya's marathon block), so Alex gets "Time to make the call".
- **Action-driven:** use a second browser profile as another friend (each browser profile is its own device). Turn notifications on as **Sam** there, then as Alex record "I paid Sam" in The Group Chat's ledger, or make the call on Priya's marathon bet. Sam gets a push; Alex, who did it, doesn't.

```bash
npm test          # engine unit tests: payouts, ledger, scoring, rules
npm run typecheck
npm run lint
```

---

## Deploy for your friends (Vercel + Turso + Google, all free tiers)

You need three things: a database, Google sign-in credentials, and (optionally) an Anthropic API key.

### 1. Database (Turso)

```bash
# https://docs.turso.tech/cli/installation
turso auth signup
turso db create called-it
turso db show called-it --url          # → DATABASE_URL (libsql://…)
turso db tokens create called-it       # → DATABASE_AUTH_TOKEN
```

Migrations run automatically on every build (`npm run build` runs `scripts/migrate.ts` first).

### 2. Google sign-in

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) and create a project.
2. **OAuth consent screen:** choose External, set the app name and support email, add the `openid`, `email` and `profile` scopes, and use `https://YOUR-DOMAIN/privacy` as the privacy policy URL.
   - While the app is in **Testing**, only listed test users can sign in (up to 100), which is fine for a friend group. **Publish** it to let anyone with an invite link in. Basic sign-in scopes like these normally don't need Google's full verification review.
3. **Create credentials → OAuth client ID → Web application:**
   - Authorized JavaScript origin: `https://YOUR-DOMAIN`
   - Authorized redirect URI: `https://YOUR-DOMAIN/api/auth/google/callback`
   - For local testing with real Google, also add `http://localhost:3000` and `http://localhost:3000/api/auth/google/callback`.
4. Copy the client ID and secret.

### 3. Vercel

Push this folder to a GitHub repo, import it at [vercel.com/new](https://vercel.com/new), and set these environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `libsql://…` from Turso (or connect Turso from the Vercel Marketplace, which sets `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`; either works) |
| `DATABASE_AUTH_TOKEN` | token from Turso |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google |
| `APP_URL` | `https://YOUR-DOMAIN` (no trailing slash; must match the Google redirect URI) |
| `ANTHROPIC_API_KEY` | optional: enables Claude |
| `CRON_SECRET` | any long random string (Vercel sends it to `/api/cron`) |
| `CLAUDE_DAILY_LIMIT_PER_GROUP` | optional cost cap (default 40 Claude calls per group per 24h) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | optional: enables push notifications. Generate once with `npm run push:keys -- --print` and keep them |
| `VAPID_SUBJECT` | `mailto:you@yourdomain.com` or `https://YOUR-DOMAIN` (push services use it to contact you; defaults to `APP_URL`) |

`vercel.json` schedules `/api/cron` once a day (the Hobby-plan maximum). The cron is only a backstop: review windows, dispute votes and due Claude work are also processed whenever anyone opens the app.

Notifications triggered by someone's action (a call, a dispute, a challenge, a payment, a settlement) go out immediately. The ones driven by the clock ("a bet you judge is due", "Claude's pick is out", a review window lapsing into a settlement) go out on the next sweep, which happens when anyone in that group opens the app or when the cron runs. On the Hobby plan that can mean a delay of up to a day in a quiet group. For snappier timing, point any free external scheduler (cron-job.org, a GitHub Actions schedule) at `GET https://YOUR-DOMAIN/api/cron` every 15 minutes with the header `Authorization: Bearer $CRON_SECRET`.

The live instance does this with a Cloudflare Worker in `ops/cron-pinger/` (free plan, schedule-only, no public URL). Deploy it from that folder with `npx wrangler@4 deploy`, and set its secret with `npx wrangler@4 secret put CRON_SECRET`, which must match `CRON_SECRET` in Vercel. If you rotate the secret, update both, then redeploy the site. Watch runs with `npx wrangler@4 tail`.

Then share `https://YOUR-DOMAIN`, create a group, and drop the invite link in your group chat. The app is installable on phones (Share → Add to Home Screen).

### Deploying from the command line (Windows, no GitHub needed)

The live instance (calledit.rwang.dev) is deployed with the Vercel CLI rather than a Git integration:

- `.\scripts\setup-production.ps1`: one-time setup for a linked project. It adds Turso from the Vercel Marketplace, connects the Cloudflare DNS record via Domain Connect, prompts for the Google and Anthropic secrets (hidden input, sent straight to Vercel), then deploys. Re-running it skips finished steps.
- `npm run deploy`: ships the **last commit** to production. It exports `HEAD` to a temp folder first, so uncommitted edits never go live. Migrations run during the build.

`vercel.json` pins the framework to Next.js, because projects created from the CLI default to "Other" and would serve every route as a 404.

Each friend turns notifications on per device, from their profile page. On iPhone and iPad (iOS 16.4+), web push only works once the app has been added to the Home Screen and opened from there; the profile page explains this to iOS visitors.

---

## How the rules work

The full version is in the app at `/how-it-works`. In short:

- **Pari-mutuel payouts, capped at fair odds.** Winners split the losing side's pot in proportion to their stakes, but nobody wins more than their stake × (options − 1): even money on yes/no. So a $1 bet against someone's $10 wins $1, and unclaimed losing money is refunded pro-rata. With no counterparty, stakes are refunded. Cents are split with largest-remainder rounding, so totals always balance exactly.
- **Challenges.** Each person who fails pays their stake, split among those who succeed. If everyone succeeds or everyone fails, nobody pays. Opponents must accept; nobody is signed up without consent.
- **Lifecycle.** Open → betting closes (positions lock) → result due → judge calls it → 24h review (everyone confirms = instant settle; no dispute = settles at window end) → or a dispute opens a 48h vote among participants. Uphold vs void: a strict majority ends it early, and ties void. A judge can call early, which closes betting.
- **Conflicts of interest.** Neutral judges can't bet. The subject of a bet can't judge it and can only back themselves. Claude's pick stays on the server, never sent to browsers, until betting closes, so nobody can copy it.
- **Scoring: edge over the room.** Each pick's Brier score is compared with everyone else's on the same bet (Claude included): edge = their average Brier − yours. Sure things earn ~0, and points only move between the people on a bet, so friends can't farm each other. Under 3 rated calls is "provisional". Void bets don't count. Challenges are tracked separately as follow-through.
- **Rated vs. unrated.** A settled bet counts toward scores only if at least two people forecast it, betting stayed open for an hour (early calls included), and a judge with a stake was confirmed by someone on another side or upheld by a vote. Unrated bets still settle money. Logic: `src/lib/engine/rating.ts`.
- **Ledger.** Balances = settlements + confirmed payments. "I paid" needs the receiver's confirmation; "they paid me" is confirmed immediately.

## Notifications

| Who | When |
|---|---|
| The judge | A bet they judge reaches its result date (and the creator, if Claude can't call a bet it was judging) |
| Participants who get a say | A call is made: confirm or dispute within 24h |
| Participants who haven't voted | A call is disputed and the 48h vote opens |
| The opponent | They're challenged head-to-head |
| The receiver | Someone records "I paid you" |
| Each participant | A bet they're in settles, with their own result |
| Participants | Betting closes and Claude's sealed pick is revealed |

Rules: nobody is notified about their own action, only current group members are notified, and one action sends at most one push per person (several updates collapse into one summary). Pushes are built after the response is sent (`after()`), so they never slow an action down. Code: `src/lib/notify/` (`compose.ts` is the pure, unit-tested part), the service worker is `public/sw.js`, and subscriptions live in `push_subscriptions`. Signing out removes that device's subscription.

## Privacy and security notes

The full write-up, with file pointers, is in [SECURITY.md](SECURITY.md).

- Password accounts: usernames are optional alongside Google. Passwords are hashed with scrypt (N=2^16, r=8, p=2, per-user salt), wrong guesses are throttled per username and per IP, and adding or changing a sign-in method needs the current password or a sign-in from the last 15 minutes. Forgot your password? Sign in with Google (if connected) and set a new one.
- Sessions are random 160-bit tokens; only SHA-256 hashes are stored. Cookies are httpOnly, Secure, and SameSite=Lax, with sliding 30-day expiry.
- Every page and server action re-checks group membership next to the data. Non-members get a 404, and profiles only show stats from groups you share.
- Only public-event bet text is sent to Anthropic. Personal bets, names, emails and comments never are.
- Push subscriptions are only accepted for the browsers' own push services (Google, Mozilla, Apple, Microsoft), so the server never sends requests to arbitrary URLs. Payloads are encrypted end to end by the Web Push protocol; push services can't read them.
- Claude calls are claimed atomically (no double-billing), retried with backoff, rate-limited per group, and logged in `claude_runs` (tokens and searches) for cost visibility.

## Project map

```
src/lib/engine/      pure, unit-tested logic: payouts, ledger, scoring, rules/state machine
src/lib/server/      lifecycle (propose → review → dispute → settle), housekeeping
src/lib/claude/      Claude agent (web search + strict tool output) and job runner
src/lib/notify/      Web Push: who hears about what, batching, delivery (+ public/sw.js)
src/lib/actions/     server actions (all inputs validated with zod)
src/lib/data/        data-access layer + view models (sealing happens here)
src/app/             routes: landing, (app)/home, g/[groupId]/…, bets/…, u/[userId], join/[code]
scripts/             migrate.ts (runs before dev/build), seed.ts (local demo data)
```

import { Google, OAuth2RequestError, decodeIdToken } from "arctic";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl, getCurrentUser, googleConfigured } from "@/lib/auth/current";
import { SESSION_COOKIE, createSession, isRecentSignIn, safeNext, sessionCookieOptions } from "@/lib/auth/session";
import { linkGoogleUser, upsertGoogleUser } from "@/lib/auth/users";

type GoogleClaims = {
  iss?: string;
  aud?: string;
  exp?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function GET(req: NextRequest) {
  const fail = (code: string) => NextResponse.redirect(new URL(`/?error=${code}`, req.url));
  if (!googleConfigured()) return fail("google_not_configured");

  const jar = await cookies();
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = jar.get("oauth_state")?.value;
  const verifier = jar.get("oauth_verifier")?.value;
  const next = safeNext(jar.get("oauth_next")?.value);
  const linking = jar.get("oauth_link")?.value === "1";
  jar.delete("oauth_link");
  jar.delete("oauth_state");
  jar.delete("oauth_verifier");
  jar.delete("oauth_next");

  if (!code || !state || !storedState || !verifier || state !== storedState) return fail("oauth_state");

  const google = new Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${appUrl(req.nextUrl.origin)}/api/auth/google/callback`,
  );

  let claims: GoogleClaims;
  try {
    const tokens = await google.validateAuthorizationCode(code, verifier);
    // The ID token came straight from Google's token endpoint over TLS, so per
    // OIDC Core §3.1.3.7 we may skip signature checks — but we still check claims.
    claims = decodeIdToken(tokens.idToken()) as GoogleClaims;
  } catch (e) {
    console.error("Google OAuth exchange failed", e instanceof OAuth2RequestError ? e.code : e);
    return fail("oauth_exchange");
  }

  const issOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issOk || claims.aud !== process.env.GOOGLE_CLIENT_ID || !claims.exp || claims.exp * 1000 < Date.now()) {
    return fail("oauth_claims");
  }
  if (!claims.sub || !claims.email || claims.email_verified !== true) return fail("email_unverified");

  const profile = {
    sub: claims.sub,
    email: claims.email,
    name: claims.name ?? claims.email.split("@")[0],
    picture: claims.picture ?? null,
  };

  if (linking) {
    const me = await getCurrentUser();
    if (!me) return fail("oauth_state");
    const back = new URL(`/u/${me.id}`, req.url);
    // Linking adds a way into the account, so it needs a recent sign-in, like changing a password.
    if (!(await isRecentSignIn(jar.get(SESSION_COOKIE)?.value))) {
      back.searchParams.set("error", "reauth");
      return NextResponse.redirect(back);
    }
    const linked = await linkGoogleUser(me.id, profile);
    if (!linked) back.searchParams.set("error", "google_in_use");
    return NextResponse.redirect(back);
  }

  const userId = await upsertGoogleUser(profile);
  const { token, expiresAt } = await createSession(userId);
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return NextResponse.redirect(new URL(next, req.url));
}

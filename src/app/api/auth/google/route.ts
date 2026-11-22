import { Google, generateCodeVerifier, generateState } from "arctic";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl, googleConfigured } from "@/lib/auth/current";
import { safeNext } from "@/lib/auth/session";

const TEN_MINUTES = 60 * 10;

export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/?error=google_not_configured", req.url));
  }
  const google = new Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${appUrl(req.nextUrl.origin)}/api/auth/google/callback`,
  );
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);
  url.searchParams.set("prompt", "select_account");

  const jar = await cookies();
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: TEN_MINUTES,
  };
  jar.set("oauth_state", state, opts);
  jar.set("oauth_verifier", codeVerifier, opts);
  jar.set("oauth_next", safeNext(req.nextUrl.searchParams.get("next")), opts);
  // "Connect Google" from the profile page: attach this Google account to the signed-in user.
  if (req.nextUrl.searchParams.get("link") === "1") jar.set("oauth_link", "1", opts);
  else jar.delete("oauth_link");
  return NextResponse.redirect(url);
}

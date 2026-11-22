import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ci_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Optimistic gate only: bounce signed-out visitors to the landing page (keeping
 * where they were headed), and keep the session cookie's expiry sliding. Real
 * authorization happens next to the data in every page and server action.
 */
export function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = new URL("/", req.url);
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  if (req.method === "GET") {
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
  }
  return res;
}

export const config = {
  matcher: ["/home", "/inbox", "/me", "/g/:path*", "/bets/:path*", "/u/:path*", "/groups/:path*"],
};

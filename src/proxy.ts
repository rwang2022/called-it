import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ci_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Pages that need a signed-in user (an optimistic check; the real one is next to the data). */
const PROTECTED = /^\/(home|inbox|me|g|bets|u|groups)(\/|$)/;

/**
 * Strict Content Security Policy: scripts run only if they carry this request's
 * random nonce (Next.js stamps it on its own scripts during rendering), or were
 * loaded by such a script ('strict-dynamic'). An injected <script> or inline
 * event handler can't guess the nonce, so the browser refuses to run it.
 */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // React uses eval in development only, to rebuild server error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes (group colours, chart geometry) can't run code, so they're allowed.
    "style-src 'self' 'unsafe-inline'",
    // Google profile pictures, plus generated data/blob images.
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self'",
    "connect-src 'self'",
    // canvas-confetti draws in a worker made from a blob: URL.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Runs on every page request: sets the nonce-based CSP, bounces signed-out
 * visitors away from app pages (keeping where they were headed), and keeps the
 * session cookie's expiry sliding. Real authorization happens next to the data
 * in every page and server action.
 */
export function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token && PROTECTED.test(req.nextUrl.pathname)) {
    const url = new URL("/", req.url);
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  // Next.js reads the nonce from the request's CSP header while rendering.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);

  if (token && req.method === "GET") {
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
  matcher: [
    {
      // Every page, but not API routes, static files, icons, the manifest or the service worker.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon|pwa-icon|manifest.webmanifest|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

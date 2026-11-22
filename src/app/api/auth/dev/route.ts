import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { devLoginEnabled } from "@/lib/auth/current";
import { SESSION_COOKIE, createSession, safeNext, sessionCookieOptions } from "@/lib/auth/session";

/**
 * Local-development sign-in as a seeded demo user, so the app can be exercised
 * without Google credentials. Hard-disabled outside `next dev`.
 */
export async function GET(req: NextRequest) {
  if (!devLoginEnabled()) return new NextResponse("Not found", { status: 404 });
  const id = req.nextUrl.searchParams.get("user") ?? "";
  if (!/^dev_[a-z]+$/.test(id)) return new NextResponse("Unknown dev user", { status: 400 });
  const user = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).get();
  if (!user) return new NextResponse("Run `npm run db:seed` first", { status: 400 });
  const { token, expiresAt } = await createSession(user.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), req.url));
}

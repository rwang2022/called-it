import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/current";
import { subscribePush } from "@/lib/actions/push";

/**
 * The service worker calls this when the browser rotates its push subscription
 * (`pushsubscriptionchange`), so alerts keep arriving without a trip to the
 * profile page. Same-origin JSON only; the session cookie identifies the user.
 */
export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) return new NextResponse(null, { status: 415 });
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const body = (await req.json().catch(() => null)) as { oldEndpoint?: unknown; subscription?: unknown } | null;
  const res = await subscribePush(body?.subscription as Parameters<typeof subscribePush>[0]);
  if (!res.ok) return NextResponse.json(res, { status: 400 });
  const fresh = (body?.subscription as { endpoint?: unknown } | undefined)?.endpoint;
  if (typeof body?.oldEndpoint === "string" && body.oldEndpoint !== fresh) {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, body.oldEndpoint), eq(pushSubscriptions.userId, user.id)));
  }
  return NextResponse.json({ ok: true });
}

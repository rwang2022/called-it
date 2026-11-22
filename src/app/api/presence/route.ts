import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { groupMembers, users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/current";
import { membership } from "@/lib/data/common";
import { touchPresence } from "@/lib/presence";

/** Heartbeat from an open app tab. Same-origin JSON only, like /api/push/resubscribe. */
export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) return new NextResponse(null, { status: 415 });
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  await touchPresence(user.id);
  return new NextResponse(null, { status: 204 });
}

/** When each member of a group was last seen, for the "online now" strip. Members only. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const groupId = req.nextUrl.searchParams.get("group") ?? "";
  if (!/^[0-9a-z_]{1,40}$/.test(groupId) || !(await membership(groupId, user.id))) return new NextResponse(null, { status: 404 });
  const rows = await db
    .select({ id: users.id, lastSeenAt: users.lastSeenAt })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId));
  return NextResponse.json(
    rows.map((r) => ({ id: r.id, lastSeenAt: r.lastSeenAt?.getTime() ?? null })),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

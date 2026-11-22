import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { avatars } from "@/lib/db/schema";

/**
 * Serves an uploaded profile photo. Like Google profile pictures, it's reachable
 * by anyone who knows the (unguessable) user id. The type was checked from the
 * file's bytes on upload; nosniff and a locked-down CSP (set in next.config.ts) stop it ever being run as
 * anything but an image. URLs carry ?v=, so the response can be cached forever.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params;
  const row = /^[0-9a-z_]{1,40}$/.test(userId)
    ? await db.select({ contentType: avatars.contentType, data: avatars.data }).from(avatars).where(eq(avatars.userId, userId)).get()
    : undefined;
  if (!row) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}

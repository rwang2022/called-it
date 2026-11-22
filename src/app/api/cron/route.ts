import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sweepDue } from "@/lib/server/lifecycle";
import { runDueClaudeWork } from "@/lib/claude/jobs";
import { withNotifications } from "@/lib/notify";

export const maxDuration = 300;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Settles lapsed review windows and runs due Claude predictions/verdicts. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  // One notification batch for the whole run: at most one push per person.
  const claude = await withNotifications(null, async () => {
    await sweepDue();
    return runDueClaudeWork();
  });
  return NextResponse.json({ ok: true, claude });
}

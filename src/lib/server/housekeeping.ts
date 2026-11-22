import "server-only";
import { after } from "next/server";
import { sweepDue } from "./lifecycle";
import { runDueClaudeWork } from "../claude/jobs";
import { claudeEnabled } from "../claude/agent";

/**
 * Lazy time-based transitions: settle lapsed review windows before rendering,
 * and kick off any due Claude work after the response is sent. Together with
 * the daily cron this keeps bets moving even on a free hosting tier.
 */
export async function housekeeping(groupIds: string[]) {
  if (groupIds.length === 0) return;
  try {
    await sweepDue(groupIds);
  } catch (e) {
    console.error("sweep failed", e);
  }
  if (claudeEnabled()) {
    after(async () => {
      try {
        await runDueClaudeWork(groupIds);
      } catch (e) {
        console.error("claude work failed", e);
      }
    });
  }
}

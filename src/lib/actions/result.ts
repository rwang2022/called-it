import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { getCurrentUser } from "../auth/current";
import { membership } from "../data/common";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export class ActionError extends Error {}

export async function actionUser() {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("Your session expired. Please sign in again.");
  return user;
}

export async function actionMember(groupId: string) {
  const user = await actionUser();
  const m = await membership(groupId, user.id);
  if (!m) throw new ActionError("You're not a member of this group.");
  return { user, role: m.role };
}

/** Run an action body, turning expected failures into `{ ok: false }` and letting redirects through. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ActionError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input." };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export function fail(message: string): never {
  throw new ActionError(message);
}

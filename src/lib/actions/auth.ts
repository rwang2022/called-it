"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, invalidateSessionToken } from "../auth/session";

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSessionToken(token);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}

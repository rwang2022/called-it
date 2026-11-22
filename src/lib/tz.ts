import "server-only";
import { cookies } from "next/headers";

export const TZ_COOKIE = "tz";

/** The viewer's IANA timezone (synced from the browser), so server-rendered dates are local. */
export async function viewerTimeZone(): Promise<string> {
  const raw = (await cookies()).get(TZ_COOKIE)?.value;
  if (raw) {
    try {
      const tz = decodeURIComponent(raw);
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      /* fall through */
    }
  }
  return "UTC";
}

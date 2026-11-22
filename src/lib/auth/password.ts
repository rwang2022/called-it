import "server-only";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { authThrottle } from "../db/schema";

// scrypt with N=2^16, r=8, p=2: one of OWASP's recommended scrypt settings
// (64 MiB of memory per guess). Parameters are stored with each hash, so they
// can be raised later and old hashes still verify.
const N = 2 ** 16;
const R = 8;
const P = 2;
const KEYLEN = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  const opts: ScryptOptions = { N: n, r, p, maxmem: 256 * n * r };
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$N$r$p$salt$hash", salt and hash in base64url. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const nn = Number(n);
  const rr = Number(r);
  const pp = Number(p);
  if (![nn, rr, pp].every(Number.isSafeInteger) || nn > 2 ** 20 || rr > 32 || pp > 4) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), nn, rr, pp);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A real hash of a random password: verifying against it costs the same as a real account. */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString("hex")));

export const USERNAME_RE = /^[a-z0-9][a-z0-9_.]{1,22}[a-z0-9]$/;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

export const normalizeUsername = (u: string) => u.trim().toLowerCase().replace(/^@/, "");

// --- Throttling ------------------------------------------------------------

const WINDOW_MS = 15 * 60 * 1000;
export const LIMITS = { user: 8, ip: 40, signup: 10 } as const;

/** True when `key` has used up `limit` failures in the current window. */
export async function throttled(key: string, limit: number) {
  const row = await db.select().from(authThrottle).where(eq(authThrottle.key, key)).get();
  if (!row) return false;
  if (row.windowStart.getTime() + WINDOW_MS < Date.now()) return false;
  return row.failures >= limit;
}

/** Count one failure (or one sign-up) against `key`, starting a new window if the old one lapsed. */
export async function recordFailure(key: string) {
  const now = new Date();
  const lapsed = new Date(now.getTime() - WINDOW_MS);
  await db
    .insert(authThrottle)
    .values({ key, failures: 1, windowStart: now })
    .onConflictDoUpdate({
      target: authThrottle.key,
      set: {
        failures: sql`case when ${authThrottle.windowStart} < ${lapsed.getTime()} then 1 else ${authThrottle.failures} + 1 end`,
        windowStart: sql`case when ${authThrottle.windowStart} < ${lapsed.getTime()} then ${now.getTime()} else ${authThrottle.windowStart} end`,
      },
    });
}

export async function clearFailures(key: string) {
  await db.delete(authThrottle).where(eq(authThrottle.key, key));
}

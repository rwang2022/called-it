/**
 * Database connection settings, shared by the app, migrations and drizzle-kit.
 *
 * Accepts our own names (DATABASE_URL / DATABASE_AUTH_TOKEN) or the ones the
 * Vercel Marketplace Turso integration sets (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).
 * Falls back to a local SQLite file only off Vercel, so a deploy with no database
 * configured fails loudly instead of writing to a throwaway file.
 */
export function dbConfig(): { url: string; authToken?: string } {
  const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;
  if (url) return { url, authToken };
  if (process.env.VERCEL) {
    throw new Error("No database configured. Connect Turso to this Vercel project (sets TURSO_DATABASE_URL) or set DATABASE_URL.");
  }
  return { url: "file:local.db" };
}

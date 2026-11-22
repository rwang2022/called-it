/**
 * Applies pending SQL migrations in ./drizzle to DATABASE_URL.
 * Runs automatically before `dev` and `build`, so deploys never ship
 * code ahead of its schema.
 */
import { config } from "dotenv";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { dbConfig } from "../src/lib/db/env";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { url, authToken } = dbConfig();
  const client = createClient({ url, authToken });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  // Claude is a first-class player: make sure its user row exists.
  await client.execute({
    sql: `INSERT INTO users (id, name, is_bot, image) VALUES ('claude', 'Claude', 1, '/claude-avatar.svg')
          ON CONFLICT(id) DO UPDATE SET is_bot = 1, image = '/claude-avatar.svg'`,
    args: [],
  });
  client.close();
  console.log(`✓ migrations applied (${url.startsWith("file:") ? url : url.replace(/\/\/.*@/, "//***@")})`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

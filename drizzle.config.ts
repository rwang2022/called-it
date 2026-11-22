import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import { defineConfig } from "drizzle-kit";
import { dbConfig } from "./src/lib/db/env";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: dbConfig(),
});

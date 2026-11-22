import "server-only";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { dbConfig } from "./env";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __libsql?: Client; __db?: DB };

function makeClient() {
  return createClient(dbConfig());
}

// Reuse one client across hot reloads in dev and across invocations in a warm lambda.
const client = globalForDb.__libsql ?? makeClient();
export const db: DB = globalForDb.__db ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__libsql = client;
  globalForDb.__db = db;
}

export { schema };

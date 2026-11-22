/**
 * Generates a VAPID key pair for Web Push.
 *
 *   npm run push:keys             write them into .env.local (if not already set)
 *   npm run push:keys -- --print  just print them, e.g. for Vercel's env settings
 *
 * Generate once per deployment and keep the pair: changing it invalidates every
 * device that has already subscribed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generateVAPIDKeys } from "web-push";

const FILE = ".env.local";
const { publicKey, privateKey } = generateVAPIDKeys();

if (process.argv.includes("--print")) {
  console.log(`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}`);
  process.exit(0);
}

let env = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const current = (key: string) => env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
if (current("VAPID_PUBLIC_KEY") && current("VAPID_PRIVATE_KEY")) {
  console.log(`✓ ${FILE} already has VAPID keys. Delete them first if you really want a new pair.`);
  process.exit(0);
}

const set = (key: string, value: string) => {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : `${env}${env && !env.endsWith("\n") ? "\n" : ""}${line}\n`;
};
set("VAPID_PUBLIC_KEY", publicKey);
set("VAPID_PRIVATE_KEY", privateKey);
writeFileSync(FILE, env);
console.log(`✓ wrote VAPID keys to ${FILE}. Restart the dev server to pick them up.`);

// Scheduled-only Worker: no fetch handler and no public URL, so nobody else can trigger it.
// Strip a byte-order mark or whitespace a shell may have added when the secret was piped in.
const clean = (s) => String(s ?? "").replace(/^﻿/, "").trim();

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const res = await fetch(env.TARGET, {
          headers: { authorization: `Bearer ${clean(env.CRON_SECRET)}` },
          signal: AbortSignal.timeout(280_000),
        });
        const body = (await res.text()).slice(0, 200);
        console.log(`cron ${res.status} ${body}`);
        if (!res.ok) throw new Error(`cron failed: ${res.status}`);
      })(),
    );
  },
};

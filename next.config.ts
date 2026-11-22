import type { NextConfig } from "next";

// Every page in this app is per-user and session-gated, so we use the classic
// dynamic rendering model rather than Cache Components (which optimises for
// static shells). Mutations call `refresh()` / redirect to re-render.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Pages get a stricter, nonce-based policy from src/proxy.ts. This baseline covers
  // everything else (API routes, icons, the manifest) and is enforced alongside it.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["@libsql/client", "libsql", "web-push"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The push service worker: always revalidate so fixes reach devices, and lock it to same-origin code.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;

"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
      <p className="display text-5xl">Well, that wasn&apos;t predicted.</p>
      <p className="mt-3 max-w-sm text-sm text-muted">Something went wrong loading this page. It&apos;s probably temporary.</p>
      <div className="mt-8 flex gap-2">
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <a href="/home" className="btn btn-ghost">
          Home
        </a>
      </div>
      {error.digest && <p className="num mt-6 text-xs text-faint">ref {error.digest}</p>}
    </div>
  );
}

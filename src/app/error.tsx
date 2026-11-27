"use client";

import { useEffect } from "react";
import { Slip, StubText } from "@/components/ui/slip";

/** Something failed to load: a ticket marked "delayed", because it usually is temporary. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4 py-12">
      <Slip
        hue={268}
        className="w-full max-w-[640px] animate-rise"
        bodyClassName="px-8 pb-9 pt-9 sm:px-10 sm:pb-10 sm:pt-10"
        stubClassName="px-8 py-7 sm:w-[200px] sm:px-8 sm:py-10"
        stub={<StubText kicker="This page" word="Delayed" detail="back shortly" color="var(--color-gold)" serial={error.digest} split="sm" />}
      >
        <p className="eyebrow" style={{ color: "oklch(0.82 0.1 268)" }}>
          Error
        </p>
        <h1 className="display mt-4 text-[2.4rem] leading-[1.04] sm:text-[2.9rem]">
          Well, that wasn&apos;t <em>predicted</em>
          <span className="text-gold">.</span>
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">Something went wrong loading this page. It&apos;s probably temporary.</p>
      </Slip>
      <div className="mt-9 flex gap-2">
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <a href="/home" className="btn btn-ghost">
          Home
        </a>
      </div>
    </div>
  );
}

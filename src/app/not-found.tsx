import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Slip, StubText } from "@/components/ui/slip";

/** A ticket for a bet that doesn't exist: void. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/home" className="mb-10 animate-fade">
        <Logo />
      </Link>
      <Slip
        hue={268}
        className="w-full max-w-[640px] animate-rise"
        bodyClassName="px-8 pb-9 pt-9 sm:px-10 sm:pb-10 sm:pt-10"
        stubClassName="px-8 py-7 sm:w-[200px] sm:px-8 sm:py-10"
        stub={<StubText kicker="This page" word="Void" detail="no such ticket" color="var(--color-no)" serial="404" split="sm" />}
      >
        <p className="eyebrow" style={{ color: "oklch(0.82 0.1 268)" }}>
          Error 404
        </p>
        <h1 className="display mt-4 text-[2.4rem] leading-[1.04] sm:text-[2.9rem]">
          Nobody called <em>this</em> one<span className="text-gold">.</span>
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">This page doesn&apos;t exist, or it belongs to a group you&apos;re not in.</p>
      </Slip>
      <Link href="/home" className="btn btn-primary mt-9 animate-rise [animation-delay:120ms]">
        Back home
      </Link>
    </div>
  );
}

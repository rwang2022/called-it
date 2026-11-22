import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo className="mb-12" />
      <p className="display text-[7rem] leading-none text-gradient">404</p>
      <h1 className="display mt-2 text-3xl">Nobody called this one.</h1>
      <p className="mt-3 max-w-sm text-sm text-muted">This page doesn&apos;t exist — or it belongs to a group you&apos;re not in.</p>
      <Link href="/home" className="btn btn-primary mt-8">
        Back home
      </Link>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, googleConfigured } from "@/lib/auth/current";
import { safeNext } from "@/lib/auth/session";
import { Logo } from "@/components/ui/logo";
import { GoogleG } from "@/components/auth/google-g";
import { PasswordForm } from "@/components/auth/password-form";
import { HueGlow, Slip } from "@/components/ui/slip";

export const metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentUser()) redirect(next);
  const mode = sp.mode === "signup" ? "signup" : "signin";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <HueGlow hue={268} strength={0.14} />
      <Link href="/" className="mb-10 animate-fade">
        <Logo />
      </Link>
      <Slip
        hue={268}
        split="none"
        className="w-full max-w-md animate-rise"
        bodyClassName="p-6 sm:p-8"
        stubClassName="px-6 py-5 sm:px-8"
        stub={
          <p className="hint text-center">
            Forgot your password? If you&apos;ve connected Google, sign in with it and set a new password on your profile.
          </p>
        }
      >
        <p className="eyebrow mb-3 text-center" style={{ color: "oklch(0.82 0.1 268)" }}>
          Admit one
        </p>
        <h1 className="display mb-7 text-center text-[2.6rem] leading-none">
          {mode === "signup" ? (
            <>
              Pull up a <em>chair</em>
            </>
          ) : (
            <>
              Welcome <em>back</em>
            </>
          )}
        </h1>
        {googleConfigured() && (
          <>
            <a href={`/api/auth/google?next=${encodeURIComponent(next)}`} className="btn btn-light btn-lg w-full gap-3">
              <GoogleG /> Continue with Google
            </a>
            <div className="my-6 flex items-center gap-3 text-xs text-faint">
              <span className="h-px flex-1 bg-white/10" />
              or use a username
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </>
        )}
        <PasswordForm next={next} initialMode={mode} />
      </Slip>
    </div>
  );
}

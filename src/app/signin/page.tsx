import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, googleConfigured } from "@/lib/auth/current";
import { safeNext } from "@/lib/auth/session";
import { Logo } from "@/components/ui/logo";
import { GoogleG } from "@/components/auth/google-g";
import { PasswordForm } from "@/components/auth/password-form";

export const metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentUser()) redirect(next);
  const mode = sp.mode === "signup" ? "signup" : "signin";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-10">
        <Logo />
      </Link>
      <div className="surface w-full max-w-md animate-rise p-6 sm:p-8">
        <h1 className="display mb-6 text-center text-4xl">{mode === "signup" ? "Pull up a chair" : "Welcome back"}</h1>
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
        <p className="hint mt-6 text-center">
          Forgot your password? If you&apos;ve connected Google, sign in with it and set a new password on your profile.
        </p>
      </div>
    </div>
  );
}

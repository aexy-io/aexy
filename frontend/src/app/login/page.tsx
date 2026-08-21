"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GitBranch } from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { safeInternalPath, stashPostLoginRedirect } from "@/lib/oauth";
import { LedgerPage } from "@/components/landing/LedgerPage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const providers = [
  { name: "Google", href: `${API_BASE_URL}/auth/google/login`, icon: <GoogleIcon /> },
  { name: "GitHub", href: `${API_BASE_URL}/auth/github/login`, icon: <SiGithub className="h-5 w-5" /> },
  { name: "Microsoft", href: `${API_BASE_URL}/auth/microsoft/login`, icon: <MicrosoftIcon /> },
];

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // Same contract as the homepage: honour ?next= deep links by stashing
    // them for the OAuth callback, and bounce already-authed visitors.
    const rawNext = new URLSearchParams(window.location.search).get("next");
    const nextPath = safeInternalPath(rawNext);
    if (nextPath) stashPostLoginRedirect(nextPath);
    if (localStorage.getItem("token")) {
      router.replace(nextPath ?? "/dashboard");
    }
  }, [router]);

  return (
    <LedgerPage chrome={false} className="relative flex flex-col">
      <header className="relative px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="rounded-[2px] bg-ledger-ink p-2 text-ledger-paper">
              <GitBranch className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-semibold tracking-tight">Aexy</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-ledger-ink/55 transition hover:text-ledger-ink">
            <ArrowLeft className="h-4 w-4" />
            Back to site
          </Link>
        </div>
      </header>

      <div className="relative flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 sm:p-10">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Get started with Aexy</h1>
            <p className="mt-3 text-sm leading-6 text-ledger-ink/65">
              Sign in or create your workspace — same flow either way. Pick a provider to continue.
            </p>

            <div className="mt-8 space-y-3">
              {providers.map(({ name, href, icon }) => (
                <a
                  key={name}
                  href={href}
                  className="flex w-full items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-6 py-3.5 text-sm font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
                >
                  {icon}
                  Continue with {name}
                </a>
              ))}
            </div>

            <p className="mt-8 text-center text-xs leading-5 text-ledger-ink/50">
              By continuing, you agree to Aexy&apos;s{" "}
              <Link href="/terms" className="underline underline-offset-2 hover:text-ledger-ink">Terms</Link> and{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-ledger-ink">Privacy Policy</Link>.
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-ledger-ink/55">
            Prefer to self-host?{" "}
            <a href="https://github.com/aexy-io/aexy" className="font-semibold text-ledger-green transition hover:text-ledger-ink">
              Get the code on GitHub
            </a>
          </p>
        </div>
      </div>
    </LedgerPage>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

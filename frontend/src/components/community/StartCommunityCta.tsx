"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Growth CTA shown on a community page to signed-in non-members and to
 * signed-out visitors: publish your own team's channels as a public forum.
 * Signed-in users go straight to the community settings; signed-out users are
 * routed through login first (returning here afterwards).
 */
export function StartCommunityCta({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("community");
  const href = signedIn
    ? "/settings/community"
    : `/login?next=${encodeURIComponent("/settings/community")}`;
  const label = signedIn ? t("start.createButton") : t("start.signInButton");

  return (
    <section className="mt-10 rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-gray-900 p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-blue-600/10 p-2.5 text-blue-600 shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {t("start.title")}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {t("start.body")}
          </p>
          <Link
            href={href}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            {label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

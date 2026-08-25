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
    <section className="mt-12 rounded-[3px] border border-ledger-ink/12 bg-ledger-card p-6">
      <div className="flex items-start gap-4">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[2px] text-ledger-paper"
          style={{ background: "var(--community-accent, #0B6B3A)" }}
        >
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-semibold tracking-tight">
            {t("start.title")}
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-ledger-ink/70">{t("start.body")}</p>
          <Link
            href={href}
            className="mt-4 inline-flex items-center gap-1.5 rounded-[3px] bg-ledger-ink px-3.5 py-2 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-paper transition hover:bg-ledger-ink/85"
          >
            {label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

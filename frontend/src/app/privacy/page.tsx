"use client";

import { Shield } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";

// "Open Ledger" long-form treatment: paper page, hairline rules between
// clauses, mono for the eyebrow and the last-updated stamp. The legal copy
// itself is untouched — only the frame around it changed.

const LAST_UPDATED = "April 2026";

const linkClass =
  "text-ledger-green underline decoration-ledger-green/30 underline-offset-4 transition hover:decoration-ledger-green";

export default function PrivacyPage() {
  return (
    <LedgerPage>

      <section className="relative px-6 pb-12 pt-32">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            <Shield className="h-4 w-4" />
            Privacy
          </div>
          <h1 className="mb-4 font-display text-4xl font-semibold leading-[1.06] tracking-tight md:text-5xl">
            Privacy Policy
          </h1>
          <p className="font-brand-mono text-xs uppercase tracking-[0.18em] text-ledger-ink/55">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="relative px-6 pb-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12 rounded-[2px] border border-ledger-ink/20 bg-ledger-card p-6 text-sm leading-6 text-ledger-ink/70">
            <strong className="font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">Notice:</strong> This is a starter privacy
            policy. Before relying on it for production, please have it reviewed by qualified
            legal counsel for your jurisdiction (GDPR, CCPA, DPDP Act, etc.).
          </div>

          <div className="max-w-none divide-y divide-ledger-ink/12 border-y border-ledger-ink/12 text-base leading-7 text-ledger-ink/75">
            <section className="py-8">
              <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">Who we are</h2>
              <p>
                Aexy provides an open-source engineering operations platform. This policy
                explains what data we collect when you use our cloud product at aexy.io,
                how we use it, and the rights you have over it. If you self-host Aexy,
                this policy does not apply — you are the data controller.
              </p>
            </section>

            <section className="py-8">
              <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">What we collect</h2>
              <p>We collect three categories of data:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6 marker:text-ledger-ink/40">
                <li>
                  <strong className="font-semibold text-ledger-ink">Account data</strong> — your name, email,
                  profile photo, and authentication identifiers from your OAuth provider
                  (Google, Microsoft, GitHub).
                </li>
                <li>
                  <strong className="font-semibold text-ledger-ink">Workspace data</strong> — the content you
                  and your team create in Aexy: sprints, tickets, performance reviews,
                  CRM records, documents, and similar artifacts.
                </li>
                <li>
                  <strong className="font-semibold text-ledger-ink">Connected-tool data</strong> — when you
                  connect GitHub, Jira, Linear, Gmail, or Calendar, we sync the data needed
                  for the features you enable, with the scopes you approve.
                </li>
                <li>
                  <strong className="font-semibold text-ledger-ink">Usage and diagnostics</strong> — server
                  logs, error reports, and product analytics (page views, feature usage)
                  to operate and improve the service.
                </li>
              </ul>
            </section>

            <section className="py-8">
              <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">How we use it</h2>
              <ul className="list-disc space-y-2 pl-6 marker:text-ledger-ink/40">
                <li>To provide the features you sign up for.</li>
                <li>To communicate about your account, billing, and important updates.</li>
                <li>To diagnose problems, prevent abuse, and improve reliability.</li>
                <li>
                  To run AI features you enable. We do not train our models on your
                  proprietary code or content without explicit opt-in.
                </li>
              </ul>
            </section>

            <section className="py-8">
              <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">Sub-processors</h2>
              <p>
                We use a small set of trusted vendors to operate the service — for cloud
                hosting, email delivery, error reporting, and AI inference (Anthropic,
                Google). We share only the minimum data each vendor needs and require them
                to handle it under appropriate data-processing terms. A current list is
                available on request to{" "}
                <a href="mailto:privacy@aexy.io" className={linkClass}>
                  privacy@aexy.io
                </a>
                .
              </p>
            </section>

            <section className="py-8">
              <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">Your rights</h2>
              <p>
                Depending on where you live, you may have the right to access, correct,
                export, or delete personal data we hold about you, and to object to certain
                processing. Email{" "}
                <a href="mailto:privacy@aexy.io" className={linkClass}>
                  privacy@aexy.io
                </a>{" "}
                and we will respond within 30 days.
              </p>
            </section>

            <section className="py-8">
              <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">Retention</h2>
              <p>
                We keep your data for as long as your account is active. If you delete a
                workspace, we remove its content within 30 days, except where we&apos;re
                required to retain something for legal or accounting reasons.
              </p>
            </section>

            <section className="py-8">
              <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">Security</h2>
              <p>
                Data is encrypted in transit (TLS) and at rest. Access to production systems
                is limited to a small set of staff and audited. See our{" "}
                <a href="/security" className={linkClass}>
                  security page
                </a>{" "}
                for details.
              </p>
            </section>

            <section className="py-8">
              <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">Changes</h2>
              <p>
                We&apos;ll post material changes to this policy on this page and notify
                customers by email when appropriate.
              </p>
            </section>

            <section className="py-8">
              <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">Contact</h2>
              <p>
                Privacy questions:{" "}
                <a href="mailto:privacy@aexy.io" className={linkClass}>
                  privacy@aexy.io
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

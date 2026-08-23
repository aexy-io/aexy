"use client";

import { Shield, Lock, Eye, Server, KeyRound, Bug } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";

// "Open Ledger" treatment: paper page, hairline trust cards with bare green
// icons, and the prose below set as a ruled document.

const PILLARS = [
  {
    icon: Lock,
    title: "Encryption everywhere",
    desc: "TLS 1.2+ in transit. AES-256 at rest. Secrets stored in a managed vault, never in code or config.",
  },
  {
    icon: Eye,
    title: "Least-privilege access",
    desc: "Production access is limited to a small on-call group, requires SSO + 2FA, and is audited.",
  },
  {
    icon: Server,
    title: "Hardened infrastructure",
    desc: "Running on managed cloud platforms with private networking, automated patching, and isolated workspaces.",
  },
  {
    icon: KeyRound,
    title: "OAuth-first auth",
    desc: "Sign in with Google, Microsoft, or GitHub. SSO and SCIM available on Enterprise.",
  },
];

const linkClass =
  "text-ledger-green underline decoration-ledger-green/30 underline-offset-4 transition hover:decoration-ledger-green";

const headingClass = "mb-3 font-display text-2xl font-semibold tracking-tight";

export default function SecurityPage() {
  return (
    <LedgerPage>

      <section className="relative px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            <Shield className="h-4 w-4" />
            Security
          </div>
          <h1 className="mb-6 font-display text-4xl font-semibold leading-[1.04] tracking-tight md:text-5xl lg:text-6xl">
            Security at{" "}
            <span className="text-ledger-green">
              Aexy
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-xl leading-8 text-ledger-ink/65">
            How we protect the data you trust us with — and what you can verify yourself
            because the platform is open source.
          </p>
        </div>
      </section>

      <section className="relative border-t border-ledger-ink/12 px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 md:grid-cols-2">
            {PILLARS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
                <Icon className="mb-4 h-5 w-5 text-ledger-green" />
                <h3 className="mb-2 font-display text-xl font-semibold tracking-tight">{title}</h3>
                <p className="text-sm leading-6 text-ledger-ink/65">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="max-w-none divide-y divide-ledger-ink/12 border-y border-ledger-ink/12 text-base leading-7 text-ledger-ink/75">
            <section className="py-8">
              <h2 className={headingClass}>Open by default</h2>
              <p>
                The core platform is open source. Anyone can audit the code, the data model,
                and the algorithms we use. If you need full control, you can self-host the
                same software we run in our cloud.
              </p>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>Compliance</h2>
              <p>
                We are working towards SOC 2 Type II certification. Until certification
                is complete, we&apos;re happy to share details of our controls and progress
                with prospective customers under NDA. Email{" "}
                <a href="mailto:security@aexy.io" className={linkClass}>
                  security@aexy.io
                </a>
                .
              </p>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>Data isolation</h2>
              <p>
                Workspace data is logically isolated and queried only by authenticated
                requests bound to that workspace. Backups are encrypted and retained for a
                limited period. Enterprise customers can request private-cloud or VPC
                deployment.
              </p>
            </section>

            <section className="py-8">
              <h2 className={`${headingClass} flex items-center gap-2`}>
                <Bug className="h-5 w-5 text-ledger-green" />
                Responsible disclosure
              </h2>
              <p>
                If you believe you&apos;ve found a security issue, please email{" "}
                <a href="mailto:security@aexy.io" className={linkClass}>
                  security@aexy.io
                </a>{" "}
                with steps to reproduce. Please do not publicly disclose until we&apos;ve had
                a reasonable opportunity to fix it (typically 90 days). We commit to
                acknowledging reports within two business days and to keeping you informed
                while we work on a fix.
              </p>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>Incident response</h2>
              <p>
                If a security incident affects your data, we&apos;ll notify the affected
                workspace owners as quickly as we have reliable information, and follow up
                with a written post-incident review.
              </p>
            </section>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

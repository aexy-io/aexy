"use client";

import { FileText } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";

// "Open Ledger" long-form treatment. Clause numbers stay part of the heading
// text (unchanged copy) but render in the mono face so the document scans
// like a numbered ledger; hairline rules separate the clauses.

const LAST_UPDATED = "April 2026";

const linkClass =
  "text-ledger-green underline decoration-ledger-green/30 underline-offset-4 transition hover:decoration-ledger-green";

const headingClass = "mb-3 font-display text-2xl font-semibold tracking-tight";
const clauseNumberClass = "font-brand-mono text-xl text-ledger-green";

export default function TermsPage() {
  return (
    <LedgerPage>

      <section className="relative px-6 pb-12 pt-32">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            <FileText className="h-4 w-4" />
            Terms
          </div>
          <h1 className="mb-4 font-display text-4xl font-semibold leading-[1.06] tracking-tight md:text-5xl">
            Terms of Service
          </h1>
          <p className="font-brand-mono text-xs uppercase tracking-[0.18em] text-ledger-ink/55">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="relative px-6 pb-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12 rounded-[2px] border border-ledger-ink/20 bg-ledger-card p-6 text-sm leading-6 text-ledger-ink/70">
            <strong className="font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">Notice:</strong> These are starter terms.
            Before relying on them in production, please have them reviewed by qualified
            legal counsel for your jurisdiction.
          </div>

          <div className="max-w-none divide-y divide-ledger-ink/12 border-y border-ledger-ink/12 text-base leading-7 text-ledger-ink/75">
            <section className="py-8">
              <h2 className={headingClass}>
                <span className={clauseNumberClass}>1.</span> Acceptance
              </h2>
              <p>
                By signing up for or using Aexy&apos;s cloud service (&quot;the Service&quot;),
                you agree to these Terms. If you&apos;re using the Service on behalf of an
                organization, you represent that you have authority to bind that organization.
              </p>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>
                <span className={clauseNumberClass}>2.</span> The Service
              </h2>
              <p>
                Aexy provides a hosted engineering operations platform. The core open-source
                code is available under the license in our public repository. The cloud
                Service includes additional features and is provided as described on our
                pricing page.
              </p>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>
                <span className={clauseNumberClass}>3.</span> Your account
              </h2>
              <p>
                You&apos;re responsible for the activity under your account, for keeping
                credentials secure, and for the conduct of users you invite to your workspace.
                You must be at least 16 years old to use the Service.
              </p>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>
                <span className={clauseNumberClass}>4.</span> Your content
              </h2>
              <p>
                You retain all rights to the data, code, and content you put into Aexy
                (&quot;Customer Data&quot;). You grant us a limited license to store, transmit,
                and process Customer Data only as needed to provide the Service. We do not
                train AI models on Customer Data without explicit opt-in.
              </p>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>
                <span className={clauseNumberClass}>5.</span> Acceptable use
              </h2>
              <p>You agree not to:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6 marker:text-ledger-ink/40">
                <li>Use the Service to violate any law or third-party rights.</li>
                <li>Attempt to bypass rate limits, security controls, or billing.</li>
                <li>
                  Upload malware, illegal content, or content that infringes intellectual
                  property.
                </li>
                <li>Resell the Service without a written agreement with us.</li>
              </ul>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>
                <span className={clauseNumberClass}>6.</span> Fees
              </h2>
              <p>
                Paid plans are billed in advance and are non-refundable except where required
                by law. We may change prices on 30 days&apos; notice for the next billing
                period. Self-hosted use of the open-source platform is free under the terms
                of its license.
              </p>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>
                <span className={clauseNumberClass}>7.</span> Termination
              </h2>
              <p>
                You can cancel anytime from your account settings. We may suspend or terminate
                accounts that materially breach these Terms or that pose a security risk to
                other users. After termination, we&apos;ll delete Customer Data within 30 days,
                except where retention is required by law.
              </p>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>
                <span className={clauseNumberClass}>8.</span> Warranties &amp; liability
              </h2>
              <p>
                The Service is provided &quot;as is&quot; without warranties of any kind, to
                the maximum extent permitted by law. To the extent permitted by law, neither
                party will be liable for indirect, incidental, or consequential damages, and
                each party&apos;s total liability is capped at the fees you paid in the
                12 months before the event giving rise to the claim.
              </p>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>
                <span className={clauseNumberClass}>9.</span> Changes
              </h2>
              <p>
                We may update these Terms occasionally. If a change is material, we&apos;ll
                notify you by email or in-product. Continued use of the Service after a change
                takes effect means you accept the updated Terms.
              </p>
            </section>

            <section className="py-8">
              <h2 className={headingClass}>
                <span className={clauseNumberClass}>10.</span> Contact
              </h2>
              <p>
                Questions about these Terms:{" "}
                <a href="mailto:legal@aexy.io" className={linkClass}>
                  legal@aexy.io
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

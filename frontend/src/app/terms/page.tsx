"use client";

import { FileText } from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const LAST_UPDATED = "April 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      <section className="pt-32 pb-12 px-6 relative">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500/20 to-purple-500/20 border border-primary-500/30 rounded-full text-primary-400 text-sm mb-6">
            <FileText className="h-4 w-4" />
            Terms
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Terms of Service
          </h1>
          <p className="text-white/40 text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
      </section>

      <section className="pb-24 px-6 relative">
        <div className="max-w-3xl mx-auto">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 mb-12 text-amber-200/80 text-sm">
            <strong className="text-amber-300">Notice:</strong> These are starter terms.
            Before relying on them in production, please have them reviewed by qualified
            legal counsel for your jurisdiction.
          </div>

          <div className="prose prose-invert prose-lg max-w-none space-y-8 text-white/70 leading-relaxed">
            <section>
              <h2 className="text-2xl font-bold text-white mb-3">1. Acceptance</h2>
              <p>
                By signing up for or using Aexy&apos;s cloud service (&quot;the Service&quot;),
                you agree to these Terms. If you&apos;re using the Service on behalf of an
                organization, you represent that you have authority to bind that organization.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">2. The Service</h2>
              <p>
                Aexy provides a hosted engineering operations platform. The core open-source
                code is available under the license in our public repository. The cloud
                Service includes additional features and is provided as described on our
                pricing page.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">3. Your account</h2>
              <p>
                You&apos;re responsible for the activity under your account, for keeping
                credentials secure, and for the conduct of users you invite to your workspace.
                You must be at least 16 years old to use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">4. Your content</h2>
              <p>
                You retain all rights to the data, code, and content you put into Aexy
                (&quot;Customer Data&quot;). You grant us a limited license to store, transmit,
                and process Customer Data only as needed to provide the Service. We do not
                train AI models on Customer Data without explicit opt-in.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">5. Acceptable use</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>Use the Service to violate any law or third-party rights.</li>
                <li>Attempt to bypass rate limits, security controls, or billing.</li>
                <li>
                  Upload malware, illegal content, or content that infringes intellectual
                  property.
                </li>
                <li>Resell the Service without a written agreement with us.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">6. Fees</h2>
              <p>
                Paid plans are billed in advance and are non-refundable except where required
                by law. We may change prices on 30 days&apos; notice for the next billing
                period. Self-hosted use of the open-source platform is free under the terms
                of its license.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">7. Termination</h2>
              <p>
                You can cancel anytime from your account settings. We may suspend or terminate
                accounts that materially breach these Terms or that pose a security risk to
                other users. After termination, we&apos;ll delete Customer Data within 30 days,
                except where retention is required by law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">8. Warranties &amp; liability</h2>
              <p>
                The Service is provided &quot;as is&quot; without warranties of any kind, to
                the maximum extent permitted by law. To the extent permitted by law, neither
                party will be liable for indirect, incidental, or consequential damages, and
                each party&apos;s total liability is capped at the fees you paid in the
                12 months before the event giving rise to the claim.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">9. Changes</h2>
              <p>
                We may update these Terms occasionally. If a change is material, we&apos;ll
                notify you by email or in-product. Continued use of the Service after a change
                takes effect means you accept the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">10. Contact</h2>
              <p>
                Questions about these Terms:{" "}
                <a href="mailto:legal@aexy.io" className="text-primary-400 hover:text-primary-300 transition">
                  legal@aexy.io
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

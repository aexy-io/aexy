"use client";

import { Shield } from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const LAST_UPDATED = "April 2026";

export default function PrivacyPage() {
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
            <Shield className="h-4 w-4" />
            Privacy
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-white/40 text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
      </section>

      <section className="pb-24 px-6 relative">
        <div className="max-w-3xl mx-auto">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 mb-12 text-amber-200/80 text-sm">
            <strong className="text-amber-300">Notice:</strong> This is a starter privacy
            policy. Before relying on it for production, please have it reviewed by qualified
            legal counsel for your jurisdiction (GDPR, CCPA, DPDP Act, etc.).
          </div>

          <div className="prose prose-invert prose-lg max-w-none space-y-8 text-white/70 leading-relaxed">
            <section>
              <h2 className="text-2xl font-bold text-white mb-3">Who we are</h2>
              <p>
                Aexy provides an open-source engineering operations platform. This policy
                explains what data we collect when you use our cloud product at aexy.io,
                how we use it, and the rights you have over it. If you self-host Aexy,
                this policy does not apply — you are the data controller.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">What we collect</h2>
              <p>We collect three categories of data:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>
                  <strong className="text-white">Account data</strong> — your name, email,
                  profile photo, and authentication identifiers from your OAuth provider
                  (Google, Microsoft, GitHub).
                </li>
                <li>
                  <strong className="text-white">Workspace data</strong> — the content you
                  and your team create in Aexy: sprints, tickets, performance reviews,
                  CRM records, documents, and similar artifacts.
                </li>
                <li>
                  <strong className="text-white">Connected-tool data</strong> — when you
                  connect GitHub, Jira, Linear, Gmail, or Calendar, we sync the data needed
                  for the features you enable, with the scopes you approve.
                </li>
                <li>
                  <strong className="text-white">Usage and diagnostics</strong> — server
                  logs, error reports, and product analytics (page views, feature usage)
                  to operate and improve the service.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">How we use it</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>To provide the features you sign up for.</li>
                <li>To communicate about your account, billing, and important updates.</li>
                <li>To diagnose problems, prevent abuse, and improve reliability.</li>
                <li>
                  To run AI features you enable. We do not train our models on your
                  proprietary code or content without explicit opt-in.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">Sub-processors</h2>
              <p>
                We use a small set of trusted vendors to operate the service — for cloud
                hosting, email delivery, error reporting, and AI inference (Anthropic,
                Google). We share only the minimum data each vendor needs and require them
                to handle it under appropriate data-processing terms. A current list is
                available on request to{" "}
                <a href="mailto:privacy@aexy.io" className="text-primary-400 hover:text-primary-300 transition">
                  privacy@aexy.io
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">Your rights</h2>
              <p>
                Depending on where you live, you may have the right to access, correct,
                export, or delete personal data we hold about you, and to object to certain
                processing. Email{" "}
                <a href="mailto:privacy@aexy.io" className="text-primary-400 hover:text-primary-300 transition">
                  privacy@aexy.io
                </a>{" "}
                and we will respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">Retention</h2>
              <p>
                We keep your data for as long as your account is active. If you delete a
                workspace, we remove its content within 30 days, except where we&apos;re
                required to retain something for legal or accounting reasons.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">Security</h2>
              <p>
                Data is encrypted in transit (TLS) and at rest. Access to production systems
                is limited to a small set of staff and audited. See our{" "}
                <a href="/security" className="text-primary-400 hover:text-primary-300 transition">
                  security page
                </a>{" "}
                for details.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">Changes</h2>
              <p>
                We&apos;ll post material changes to this policy on this page and notify
                customers by email when appropriate.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">Contact</h2>
              <p>
                Privacy questions:{" "}
                <a href="mailto:privacy@aexy.io" className="text-primary-400 hover:text-primary-300 transition">
                  privacy@aexy.io
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

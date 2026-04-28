"use client";

import { Shield, Lock, Eye, Server, KeyRound, Bug } from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

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

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      <section className="pt-32 pb-16 px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500/20 to-purple-500/20 border border-primary-500/30 rounded-full text-primary-400 text-sm mb-6">
            <Shield className="h-4 w-4" />
            Security
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            Security at{" "}
            <span className="bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
              Aexy
            </span>
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            How we protect the data you trust us with — and what you can verify yourself
            because the platform is open source.
          </p>
        </div>
      </section>

      <section className="py-12 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            {PILLARS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all">
                <div className="p-3 bg-gradient-to-br from-primary-500 to-purple-500 rounded-2xl shadow-lg w-fit mb-4">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 relative">
        <div className="max-w-3xl mx-auto">
          <div className="prose prose-invert prose-lg max-w-none space-y-10 text-white/70 leading-relaxed">
            <section>
              <h2 className="text-2xl font-bold text-white mb-3">Open by default</h2>
              <p>
                The core platform is open source. Anyone can audit the code, the data model,
                and the algorithms we use. If you need full control, you can self-host the
                same software we run in our cloud.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">Compliance</h2>
              <p>
                We are working towards SOC 2 Type II certification. Until certification
                is complete, we&apos;re happy to share details of our controls and progress
                with prospective customers under NDA. Email{" "}
                <a href="mailto:security@aexy.io" className="text-primary-400 hover:text-primary-300 transition">
                  security@aexy.io
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">Data isolation</h2>
              <p>
                Workspace data is logically isolated and queried only by authenticated
                requests bound to that workspace. Backups are encrypted and retained for a
                limited period. Enterprise customers can request private-cloud or VPC
                deployment.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                <Bug className="h-6 w-6 text-emerald-400" />
                Responsible disclosure
              </h2>
              <p>
                If you believe you&apos;ve found a security issue, please email{" "}
                <a href="mailto:security@aexy.io" className="text-primary-400 hover:text-primary-300 transition">
                  security@aexy.io
                </a>{" "}
                with steps to reproduce. Please do not publicly disclose until we&apos;ve had
                a reasonable opportunity to fix it (typically 90 days). We commit to
                acknowledging reports within two business days and to keeping you informed
                while we work on a fix.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-3">Incident response</h2>
              <p>
                If a security incident affects your data, we&apos;ll notify the affected
                workspace owners as quickly as we have reliable information, and follow up
                with a written post-incident review.
              </p>
            </section>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

"use client";

import Link from "next/link";
import {
  ArrowRight,
  Github,
  Code2,
  CheckCircle2,
  Target,
  GraduationCap,
  Shield,
  Eye,
  Keyboard,
  Star,
  Trophy,
  GitPullRequest,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";

// "Open Ledger" light brand: paper page, ink text, ledger-green accents. The
// product only appears inside the one dark pane (the CLI plate) further down.


const benefits = [
  {
    icon: Shield,
    title: "No Surveillance",
    description: "We track contributions, not keystrokes. No screenshots, no productivity scores. Your work speaks for itself.",
  },
  {
    icon: Eye,
    title: "Transparent Algorithms",
    description: "Open source means you can see exactly how we calculate everything. No black boxes.",
  },
  {
    icon: GraduationCap,
    title: "Grow Your Skills",
    description: "Get personalized learning paths based on skill gaps. Level up with real guidance.",
  },
  {
    icon: Target,
    title: "Fair Reviews",
    description: "Performance reviews backed by your actual contributions. No more politics.",
  },
];

const devFeatures = [
  { title: "Keyboard-first", desc: "Navigate with shortcuts. Built for developers who hate mice.", icon: Keyboard },
  { title: "GitHub Native", desc: "Deep integration with your existing workflow. Not another tool to learn.", icon: Github },
  { title: "Skill Profiles", desc: "Auto-generated from your code. Show what you actually know.", icon: Code2 },
  { title: "Learning Paths", desc: "Gamified skill development. Earn badges, level up.", icon: Trophy },
];

export default function DevelopersPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-5xl mx-auto text-center">
          <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            <Code2 className="h-4 w-4" />
            <span>For Developers</span>
          </div>

          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold text-ledger-ink mb-6 tracking-tight leading-tight">
            Tools that <span className="text-ledger-green">respect</span> developers
          </h1>

          <p className="text-xl text-ledger-ink/65 mb-10 max-w-3xl mx-auto leading-relaxed">
            Finally, engineering tools that don&apos;t treat you like a resource to be monitored.
            Open source. Keyboard-first. Built by developers, for developers.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green text-ledger-paper px-8 py-4 text-lg font-semibold transition hover:bg-[#095A31]"
            >
              <Github className="h-5 w-5" />
              Sign in with GitHub
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group inline-flex items-center justify-center gap-2 rounded-[2px] border border-ledger-ink/25 text-ledger-ink px-8 py-4 text-lg font-medium transition hover:border-ledger-ink/50"
            >
              View Source
              <Star className="h-5 w-5 text-ledger-green" />
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-ledger-ink/55">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ledger-green" />
              100% open source
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ledger-green" />
              Self-host free
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ledger-green" />
              No surveillance
            </span>
          </div>
        </div>
      </section>

      {/* Dev Features */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-4 gap-4">
            {devFeatures.map((feature, idx) => (
              <div
                key={idx}
                className="p-6 rounded-[2px] border border-ledger-ink/12 bg-ledger-card text-center transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <feature.icon className="mx-auto mb-4 h-5 w-5 text-ledger-green" />
                <h3 className="font-display text-ledger-ink font-semibold mb-2">{feature.title}</h3>
                <p className="text-ledger-ink/65 text-sm leading-6">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-ledger-ink mb-4 tracking-tight">
              Why developers love Aexy
            </h2>
            <p className="text-ledger-ink/60 text-lg">
              Built with developer experience as the top priority.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {benefits.map((benefit, idx) => (
              <div
                key={idx}
                className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <benefit.icon className="mb-6 h-5 w-5 text-ledger-green" />
                <h3 className="font-display text-xl font-semibold text-ledger-ink mb-3">{benefit.title}</h3>
                <p className="text-ledger-ink/65 leading-7">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Terminal Preview — a genuine product mockup, so it stays a dark pane
          (the "plate" in the manual). white/* utilities below are scoped to
          this pane on purpose. */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane text-[#E6EDE7]">
            {/* Terminal Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <div className="flex gap-2">
                <div className="w-3 h-3 bg-white/20 rounded-full" />
                <div className="w-3 h-3 bg-white/20 rounded-full" />
                <div className="w-3 h-3 bg-ledger-mint rounded-full" />
              </div>
              <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55 ml-4">~ aexy profile</span>
            </div>
            {/* Terminal Content */}
            <div className="p-6 font-brand-mono text-sm">
              <div className="text-ledger-mint mb-2">$ aexy profile --skills</div>
              <div className="text-white/55 mb-4">
                <div className="mb-2">Analyzing 247 commits across 12 repositories...</div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-4">
                  <span className="text-white/85 w-24">TypeScript</span>
                  <div className="flex-1 h-2 bg-white/10">
                    <div className="h-full w-[92%] bg-ledger-mint" />
                  </div>
                  <span className="text-ledger-mint w-12 text-right">92%</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-white/85 w-24">React</span>
                  <div className="flex-1 h-2 bg-white/10">
                    <div className="h-full w-[87%] bg-ledger-mint" />
                  </div>
                  <span className="text-ledger-mint w-12 text-right">87%</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-white/85 w-24">Node.js</span>
                  <div className="flex-1 h-2 bg-white/10">
                    <div className="h-full w-[78%] bg-ledger-mint" />
                  </div>
                  <span className="text-ledger-mint w-12 text-right">78%</span>
                </div>
              </div>
              <div className="text-white/50">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4" />
                  <span>Last contribution: 2 hours ago</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Open Source Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <div className="flex items-start gap-4">
              <Github className="h-5 w-5 flex-shrink-0 text-ledger-green" />
              <div>
                <h2 className="font-display text-2xl md:text-3xl font-semibold text-ledger-ink mb-4 tracking-tight">
                  Open source, always
                </h2>
                <p className="text-ledger-ink/65 leading-7 mb-6">
                  Every algorithm, every metric, every line of code is open for you to inspect.
                  We believe developer tools should be transparent. Fork it, audit it, self-host it.
                  Your data, your rules.
                </p>
                <a
                  href="https://github.com/aexy-io/aexy"
                  className="inline-flex items-center gap-2 font-semibold text-ledger-green transition hover:text-ledger-ink"
                >
                  Star us on GitHub
                  <Star className="h-4 w-4 fill-current" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-ledger-ink mb-4 tracking-tight">
            Join developers who get it
          </h2>
          <p className="text-xl text-ledger-ink/60 mb-10">
            Tools that respect your craft.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green text-ledger-paper px-8 py-4 text-lg font-semibold transition hover:bg-[#095A31]"
            >
              <Github className="h-5 w-5" />
              Sign in with GitHub
            </Link>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 text-ledger-ink px-8 py-4 text-lg font-semibold transition hover:border-ledger-ink/50"
            >
              View Source Code
            </a>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, Heart, Lightbulb, Rocket, Users, Code2, Target } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";


// "Open Ledger" brand: paper page, ink text, ledger-green as the only accent.
// Chapters are separated by hairline ink rules rather than gradient spines.
export default function StoryPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="relative px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <p className="mb-5 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
              <Heart className="h-4 w-4" />
              Our Story
            </p>
            <h1 className="mb-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ledger-ink md:text-5xl lg:text-6xl">
              Built by engineers,{" "}
              <span className="text-ledger-green">
                for engineers.
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-xl leading-8 text-ledger-ink/65">
              The story of how frustration with fragmented tools led to building something better.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="relative px-6 py-12">
        <div className="mx-auto max-w-3xl">
          {/* The Beginning */}
          <div className="mb-16 border-t border-ledger-ink/12 pt-10">
            <div className="mb-6 flex items-center gap-3">
              <Lightbulb className="h-5 w-5 text-ledger-green" />
              <h2 className="font-display text-2xl font-semibold tracking-tight text-ledger-ink md:text-3xl">The Beginning</h2>
            </div>
            <p className="mb-6 text-lg leading-relaxed text-ledger-ink/70">
              It started with a simple observation: engineering teams were drowning in tools. Code lived in GitHub,
              tasks in Jira, docs in Notion, reviews in spreadsheets, and hiring in yet another system. Every tool
              told a different story, and no one had the complete picture.
            </p>
            <p className="text-lg leading-relaxed text-ledger-ink/70">
              We watched engineering managers spend hours reconciling data across systems. We saw talented developers
              frustrated by endless context switching. We witnessed leadership making decisions based on incomplete
              information. Something had to change.
            </p>
          </div>

          {/* The Problem */}
          <div className="relative mb-16 border-l-2 border-ledger-green pl-6">
            <p className="font-display text-xl leading-relaxed text-ledger-ink/85 md:text-2xl">
              &ldquo;We weren&apos;t just building another tool. We were building the connective tissue that
              engineering organizations desperately needed.&rdquo;
            </p>
          </div>

          {/* The Journey */}
          <div className="mb-16 border-t border-ledger-ink/12 pt-10">
            <div className="mb-6 flex items-center gap-3">
              <Rocket className="h-5 w-5 text-ledger-green" />
              <h2 className="font-display text-2xl font-semibold tracking-tight text-ledger-ink md:text-3xl">The Journey</h2>
            </div>
            <p className="mb-6 text-lg leading-relaxed text-ledger-ink/70">
              We started Aexy with a radical idea: what if there was one platform that understood the entire
              engineering organization? Not just the code, but the people, the processes, the growth, and the
              customers they serve.
            </p>
            <p className="mb-6 text-lg leading-relaxed text-ledger-ink/70">
              We built it open-source because we believe transparency breeds trust. Engineering organizations
              shouldn&apos;t have to rely on black boxes to manage their most critical operations.
            </p>
            <p className="text-lg leading-relaxed text-ledger-ink/70">
              Every feature we&apos;ve built comes from real pain points we&apos;ve experienced ourselves. Sprint planning
              that actually reflects capacity. Performance reviews that feel fair. Hiring assessments based on
              real skills. Documentation that stays connected to the work.
            </p>
          </div>

          {/* What We Believe */}
          <div className="mb-16 border-t border-ledger-ink/12 pt-10">
            <div className="mb-6 flex items-center gap-3">
              <Target className="h-5 w-5 text-ledger-green" />
              <h2 className="font-display text-2xl font-semibold tracking-tight text-ledger-ink md:text-3xl">What We Believe</h2>
            </div>
            <div className="space-y-3">
              {[
                { icon: Code2, text: "Code is the most honest data an engineering organization produces" },
                { icon: Users, text: "Great tools should empower teams, not surveil them" },
                { icon: Heart, text: "Transparency and trust are the foundation of high-performing teams" },
                { icon: Rocket, text: "World-class tools should be accessible to everyone, not just giants" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-4 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
                >
                  <item.icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-ledger-green" />
                  <span className="text-ledger-ink/75">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* The Team */}
          <div className="mb-16 border-t border-ledger-ink/12 pt-10">
            <div className="mb-6 flex items-center gap-3">
              <Users className="h-5 w-5 text-ledger-green" />
              <h2 className="font-display text-2xl font-semibold tracking-tight text-ledger-ink md:text-3xl">The Team</h2>
            </div>
            <p className="mb-6 text-lg leading-relaxed text-ledger-ink/70">
              We&apos;re a small team of engineers, designers, and dreamers who believe software can be a force for
              positive change. We&apos;ve worked at companies of all sizes and seen firsthand how the right tools
              can transform how teams operate.
            </p>
            <p className="text-lg leading-relaxed text-ledger-ink/70">
              We&apos;re building Aexy openly, transparently, and with the community. Because the best products
              are built together.
            </p>
          </div>
        </div>
      </section>

      {/* Quote Section */}
      <section className="relative border-t border-ledger-ink/12 px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-12">
            <p className="mb-6 font-display text-2xl font-semibold leading-relaxed text-ledger-ink md:text-3xl">
              &ldquo;The future of engineering organizations is integrated, transparent, and built on trust.
              We&apos;re here to make that future a reality.&rdquo;
            </p>
            <p className="font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/55">The Aexy Team</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ledger-ink/12 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-6 font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">
            Join us on this journey
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-xl leading-8 text-ledger-ink/65">
            Whether you&apos;re building the next big thing or optimizing your team&apos;s operations,
            we&apos;d love to have you along for the ride.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/manifesto"
              className="flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
            >
              Read the Manifesto
            </Link>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

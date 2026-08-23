"use client";

import Link from "next/link";
import {
  ArrowRight,
  Github,
  Star,
  Code2,
  Users,
  Layers,
  Eye,
  XCircle,
  CheckCircle2,
  GitBranch,
  GitFork,
  Server,
  Heart,
  Sparkles,
  Target,
  Zap,
  BarChart3,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";


// "Open Ledger" brand: paper page, ink text, ledger-green as the only accent.
// The one dark plate is "Our Belief" near the end, used the way the homepage
// uses product panes — a single inked page in an otherwise paper document.
export default function ManifestoPage() {

  return (
    <LedgerPage>

      {/* Hero Section */}
      <section className="relative px-6 pb-20 pt-32">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-8 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            <Sparkles className="h-4 w-4" />
            <span>Category Manifesto</span>
          </p>

          <h1 className="mb-8 font-display text-5xl font-semibold leading-[1.03] tracking-tight text-ledger-ink md:text-6xl lg:text-7xl">
            The{" "}
            <span className="text-ledger-green">
              Engineering OS
            </span>
          </h1>

          <p className="mx-auto max-w-3xl text-2xl leading-relaxed text-ledger-ink/65 md:text-3xl">
            Software companies don&apos;t fail because of a lack of tools.
            <br />
            <span className="font-medium text-ledger-ink">They fail because their tools don&apos;t agree on reality.</span>
          </p>
        </div>
      </section>

      {/* The Problem */}
      <section className="border-t border-ledger-ink/12 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <h2 className="mb-8 font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">The Problem</h2>
            <p className="mb-8 text-xl leading-8 text-ledger-ink/65">
              Modern engineering organizations run on fragments:
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { label: "Code in GitHub", icon: Code2 },
                { label: "Work in Jira", icon: Layers },
                { label: "Docs in Notion", icon: Eye },
                { label: "Reviews in spreadsheets", icon: BarChart3 },
                { label: "Hiring in ATS tools", icon: Users },
                { label: "Customers in CRMs", icon: Heart },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-4"
                >
                  <item.icon className="h-5 w-5 text-ledger-green" />
                  <span className="text-ledger-ink/70">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-10 space-y-3 text-lg text-ledger-ink/60">
              <p>Each tool tells a different story.</p>
              <p>Leaders are forced to guess.</p>
              <p>Engineers are forced to explain themselves.</p>
              <p className="font-medium text-ledger-ink">Trust erodes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* The Lie We've Accepted */}
      <section className="border-t border-ledger-ink/12 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-8 text-center font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">
            The Lie We&apos;ve Accepted
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              "Planning is separate from execution",
              "Performance is separate from work",
              "Hiring is separate from skills",
              "Customers are separate from delivery",
            ].map((lie, idx) => (
              <div
                key={idx}
                className="flex items-start gap-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6"
              >
                <XCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-ledger-red" />
                <span className="text-lg text-ledger-ink/70">{lie}</span>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-xl text-ledger-ink/55">
            This fragmentation is not normal.
            <br />
            <span className="text-ledger-ink/75">It&apos;s historical accident.</span>
          </p>
        </div>
      </section>

      {/* The Insight */}
      <section className="border-t border-ledger-ink/12 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 text-center md:p-16">
            <p className="mb-8 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
              <Zap className="h-4 w-4" />
              The Insight
            </p>

            <h2 className="mb-8 font-display text-3xl font-semibold leading-[1.08] tracking-tight text-ledger-ink md:text-4xl lg:text-5xl">
              Code is the most honest data
              <br />
              an engineering organization produces.
            </h2>

            <div className="mt-12 grid gap-4 md:grid-cols-5">
              {[
                { label: "What was actually built", icon: Code2 },
                { label: "Who worked on it", icon: Users },
                { label: "How teams collaborate", icon: Heart },
                { label: "Where systems fail", icon: Target },
                { label: "What skills truly exist", icon: Sparkles },
              ].map((item, idx) => (
                <div key={idx} className="text-center">
                  <item.icon className="mx-auto mb-3 h-5 w-5 text-ledger-green" />
                  <p className="text-sm leading-6 text-ledger-ink/60">{item.label}</p>
                </div>
              ))}
            </div>

            <p className="mt-12 text-xl text-ledger-ink/55">
              Any system that ignores this truth is incomplete.
            </p>
          </div>
        </div>
      </section>

      {/* The Engineering OS */}
      <section className="border-t border-ledger-ink/12 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">
              The Engineering OS
            </h2>
            <p className="font-brand-mono text-xs uppercase tracking-[0.18em] text-ledger-green">A new category.</p>
          </div>

          <div className="mb-16 grid gap-4 md:grid-cols-3">
            <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 text-center transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
              <Layers className="mx-auto mb-4 h-5 w-5 text-ledger-green" />
              <h3 className="mb-2 font-display text-lg font-semibold text-ledger-ink">System of Record</h3>
              <p className="text-sm leading-6 text-ledger-ink/55">Not a reporting tool</p>
            </div>
            <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 text-center transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
              <GitBranch className="mx-auto mb-4 h-5 w-5 text-ledger-green" />
              <h3 className="mb-2 font-display text-lg font-semibold text-ledger-ink">Platform</h3>
              <p className="text-sm leading-6 text-ledger-ink/55">Not a point solution</p>
            </div>
            <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 text-center transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
              <Users className="mx-auto mb-4 h-5 w-5 text-ledger-green" />
              <h3 className="mb-2 font-display text-lg font-semibold text-ledger-ink">Shared Reality</h3>
              <p className="text-sm leading-6 text-ledger-ink/55">For engineering, people, and leadership</p>
            </div>
          </div>

          {/* Connections */}
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 md:p-10">
            <h3 className="mb-8 text-center font-display text-xl font-semibold text-ledger-ink">It connects:</h3>
            <div className="flex flex-col items-center justify-center gap-4 md:flex-row md:gap-2">
              {[
                { label: "Code" },
                { label: "Planning" },
                { label: "People" },
                { label: "Growth" },
                { label: "Customers" },
              ].map((item, idx, arr) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="rounded-[2px] border border-ledger-ink/20 bg-ledger-paper px-4 py-2 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-ink/75">
                    {item.label}
                  </div>
                  {idx < arr.length - 1 && (
                    <ArrowRight className="hidden h-5 w-5 text-ledger-ink/35 md:block" />
                  )}
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-ledger-ink/55">All in one place.</p>
          </div>
        </div>
      </section>

      {/* What the Engineering OS Is Not */}
      <section className="border-t border-ledger-ink/12 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">
            What the Engineering OS Is Not
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              "Not surveillance software",
              "Not a ticketing tool with dashboards",
              "Not a CRM with engineering add-ons",
              "Not another SaaS silo",
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5"
              >
                <XCircle className="h-5 w-5 flex-shrink-0 text-ledger-red" />
                <span className="text-ledger-ink/70">{item}</span>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-xl text-ledger-ink">
            The Engineering OS is built on{" "}
            <span className="font-medium text-ledger-green">trust</span>,{" "}
            <span className="font-medium text-ledger-green">transparency</span>, and{" "}
            <span className="font-medium text-ledger-green">truth</span>.
          </p>
        </div>
      </section>

      {/* Why Open Source Matters */}
      <section className="border-t border-ledger-ink/12 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <div className="mb-6 flex items-center gap-3">
              <Github className="h-7 w-7 text-ledger-green" />
              <h2 className="font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">
                Why Open Source Matters
              </h2>
            </div>

            <p className="mb-10 text-xl leading-8 text-ledger-ink/70">
              Engineering organizations don&apos;t trust black boxes - and they shouldn&apos;t.
            </p>

            <p className="mb-8 font-brand-mono text-xs uppercase tracking-[0.18em] text-ledger-green">
              That&apos;s why the Engineering OS must be:
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              {[
                { label: "Auditable", icon: Eye },
                { label: "Forkable", icon: GitFork },
                { label: "Self-hostable", icon: Server },
                { label: "Community-driven", icon: Users },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-5"
                >
                  <item.icon className="h-5 w-5 flex-shrink-0 text-ledger-green" />
                  <span className="font-medium text-ledger-ink">{item.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-10 rounded-[2px] border border-ledger-green/30 bg-ledger-green/5 p-6">
              <p className="text-center text-lg font-medium text-ledger-green">
                Trust is not a feature. It&apos;s the foundation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The Outcome */}
      <section className="border-t border-ledger-ink/12 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">
            The Outcome
          </h2>
          <div className="space-y-3">
            {[
              "Planning reflects reality",
              "Reviews feel fair",
              "Hiring is skills-based",
              "Learning is continuous",
              "Customers stay connected to delivery",
              "Leaders see clearly",
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5"
              >
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-ledger-green" />
                <span className="text-lg text-ledger-ink/75">{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-12 space-y-2 text-center">
            <p className="text-xl text-ledger-ink/60">Less guesswork.</p>
            <p className="text-xl text-ledger-ink/60">Less politics.</p>
            <p className="text-2xl font-medium text-ledger-ink">More progress.</p>
          </div>
        </div>
      </section>

      {/* Our Belief. The one deliberately dark plate on this page — the
          manifesto's closing statement, set like an inked page. */}
      <section className="border-t border-ledger-ink/12 px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-12 text-center md:p-16">
            <h2 className="mb-8 font-display text-3xl font-semibold tracking-tight text-[#E6EDE7] md:text-4xl">Our Belief</h2>
            <blockquote className="mb-8 font-display text-2xl font-medium leading-relaxed text-[#E6EDE7] md:text-3xl">
              &ldquo;Every modern software company will eventually run on an Engineering OS.&rdquo;
            </blockquote>
            <p className="text-lg leading-8 text-white/60">
              We&apos;re building Aexy to be that system - openly, transparently, and with the community.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-ledger-ink/12 px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">
            Welcome to the Engineering OS.
          </h2>
          <p className="mb-10 text-xl leading-8 text-ledger-ink/65">
            Start with open source. Build with clarity.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="https://github.com/aexy-io/aexy"
              className="flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
            >
              <Github className="h-5 w-5" />
              View on GitHub
              <Star className="h-4 w-4 fill-ledger-green text-ledger-green" />
            </a>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

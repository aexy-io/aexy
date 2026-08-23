"use client";

import Link from "next/link";
import {
  ArrowRight,
  Users,
  CheckCircle2,
  Target,
  Calendar,
  TrendingUp,
  Activity,
  Github,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";

// "Open Ledger" light brand: paper page, ink text, ledger-green accents, and
// the homepage's diff motif (mono "-" pains, mono "+" fixes) for pain points.


const painPoints = [
  { problem: "No visibility into what the team is actually working on", solution: "Real-time activity tracking synced with GitHub" },
  { problem: "Sprint planning based on gut feeling", solution: "AI-powered capacity planning based on historical data" },
  { problem: "Performance reviews feel subjective", solution: "SMART goals linked to actual code contributions" },
  { problem: "Skill gaps discovered too late", solution: "Continuous skill analysis and learning paths" },
];

const features = [
  {
    icon: Activity,
    title: "Team Visibility",
    description: "See what your team is working on without micromanaging. Real-time dashboards, not status meetings.",
    link: "/products/tracking",
  },
  {
    icon: Calendar,
    title: "Sprint Planning",
    description: "Plan sprints with real capacity data. AI suggests task assignments based on skills and workload.",
    link: "/products/planning",
  },
  {
    icon: Target,
    title: "Performance Reviews",
    description: "Run fair reviews backed by contribution data. SMART goals that auto-link to GitHub activity.",
    link: "/products/reviews",
  },
  {
    icon: TrendingUp,
    title: "Team Growth",
    description: "Identify skill gaps and create personalized learning paths. Track growth over time.",
    link: "/products/learning",
  },
];

export default function EngineeringManagersPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-5xl mx-auto text-center">
          <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            <Users className="h-4 w-4" />
            <span>For Engineering Managers</span>
          </div>

          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold text-ledger-ink mb-6 tracking-tight leading-tight">
            Lead your team with <span className="text-ledger-green">clarity, not chaos</span>
          </h1>

          <p className="text-xl text-ledger-ink/65 mb-10 max-w-3xl mx-auto leading-relaxed">
            Stop guessing what your team is working on. Get real-time visibility, data-driven planning,
            and fair performance reviews - all without micromanaging.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green text-ledger-paper px-8 py-4 text-lg font-semibold transition hover:bg-[#095A31]"
            >
              Start Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/manifesto"
              className="group inline-flex items-center justify-center gap-2 rounded-[2px] border border-ledger-ink/25 text-ledger-ink px-8 py-4 text-lg font-medium transition hover:border-ledger-ink/50"
            >
              Read the Manifesto
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-ledger-ink/55">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ledger-green" />
              No surveillance
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ledger-green" />
              Open source
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ledger-green" />
              Free tier available
            </span>
          </div>
        </div>
      </section>

      {/* Pain Points — the diff motif: what breaks today, what replaces it */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-ledger-ink mb-4 tracking-tight">
              Sound familiar?
            </h2>
          </div>

          <div className="space-y-4">
            {painPoints.map((item, idx) => (
              <div
                key={idx}
                className="grid md:grid-cols-2 gap-4 p-6 rounded-[2px] border border-ledger-ink/12 bg-ledger-card"
              >
                <div className="flex items-start gap-3">
                  <span className="font-brand-mono leading-7 text-ledger-red">-</span>
                  <p className="text-ledger-ink/60 leading-7">{item.problem}</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="font-brand-mono leading-7 text-ledger-green">+</span>
                  <p className="text-ledger-ink/85 leading-7">{item.solution}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-ledger-ink mb-4 tracking-tight">
              Everything you need to lead effectively
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, idx) => (
              <Link key={idx} href={feature.link} className="group">
                <div className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
                  <feature.icon className="mb-6 h-5 w-5 text-ledger-green" />
                  <h3 className="font-display text-xl font-semibold text-ledger-ink mb-3">{feature.title}</h3>
                  <p className="text-ledger-ink/65 leading-7 mb-4">{feature.description}</p>
                  <span className="text-ledger-green text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                    Learn more <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-ledger-ink mb-4 tracking-tight">
              Already running Jira or Linear?
            </h2>
            <p className="text-ledger-ink/65 max-w-2xl mx-auto leading-7">
              They track issues well. Aexy tracks issues and connects them to customers,
              docs, people, and AI agents in the same workspace.
            </p>
          </div>

          <div className="overflow-x-auto rounded-[2px] border border-ledger-ink/12 bg-ledger-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-ledger-ink/12">
                  <th className="px-5 py-4 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-ink/50"> </th>
                  <th className="px-5 py-4 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-green">Aexy</th>
                  <th className="px-5 py-4 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-ink/70">Jira / Linear</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ["Scope", "Sprints, tasks, and releases connected to CRM, docs, workflows, and people data.", "Issue tracking; everything else lives in other tools."],
                  ["Git awareness", "Commits and PRs auto-link to tasks (“fixes #123”), with AI analysis of how well each PR matches its task.", "Basic commit linking."],
                  ["Incidents", "Uptime monitors and observability alerts auto-create tickets, dedupe repeats, and auto-resolve on recovery.", "Separate incident tooling."],
                  ["Planning", "Capacity planning from historical contribution data, with AI-suggested assignments.", "Manual estimation and gut-feel sprint loading."],
                  ["Team insight", "Developer insights, skill gaps, and review inputs from real GitHub activity — no surveillance.", "Velocity charts; people data lives in a separate HR tool."],
                  ["AI agents", "Governed agents can triage, summarize, update records, and run workflows across the company.", "Assistant features scoped to issues."],
                  ["Ownership", "Open source and self-hostable.", "Closed SaaS, per-seat pricing."],
                ] as const).map(([dimension, aexy, them]) => (
                  <tr key={dimension} className="border-b border-ledger-ink/12 last:border-b-0">
                    <td className="px-5 py-4 font-medium text-ledger-ink/70">{dimension}</td>
                    <td className="px-5 py-4 leading-6 text-ledger-ink/85">{aexy}</td>
                    <td className="px-5 py-4 leading-6 text-ledger-ink/55">{them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
            <Link href="/compare/jira" className="font-semibold text-ledger-green transition hover:text-[#095A31] flex items-center gap-1">
              Full Jira comparison <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/linear" className="font-semibold text-ledger-green transition hover:text-[#095A31] flex items-center gap-1">
              Full Linear comparison <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className="font-semibold text-ledger-green transition hover:text-[#095A31] flex items-center gap-1">
              Pricing <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Open source proof */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12 text-center">
            <div className="flex justify-center mb-6">
              <Github className="h-5 w-5 text-ledger-green" />
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-ledger-ink mb-4 tracking-tight">
              Don&apos;t take our word for it. Read the code.
            </h2>
            <p className="text-ledger-ink/65 max-w-2xl mx-auto mb-8 leading-7">
              Aexy is open source. Inspect how planning, insights, and agent governance
              actually work, self-host it free, and extend it to fit your team.
            </p>
            <a
              href="https://github.com/aexy-io/aexy"
              className="inline-flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 text-ledger-ink px-8 py-4 text-lg font-semibold transition hover:border-ledger-ink/50"
            >
              <Github className="h-5 w-5" />
              Explore on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-ledger-ink mb-4 tracking-tight">
            Ready to lead with clarity?
          </h2>
          <p className="text-xl text-ledger-ink/60 mb-10">
            Real visibility, data-driven planning, and fair reviews — without the tool sprawl.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green text-ledger-paper px-8 py-4 text-lg font-semibold transition hover:bg-[#095A31]"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 text-ledger-ink px-8 py-4 text-lg font-semibold transition hover:border-ledger-ink/50"
            >
              <Github className="h-5 w-5" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

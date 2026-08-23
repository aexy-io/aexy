"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  TrendingUp,
  Users,
  Shield,
  Eye,
  Target,
  Layers,
  Zap,
  Activity,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";

// "Open Ledger" light brand: paper page, ink text, ledger-green accents. Each
// challenge is written as a diff — a mono "-" for the pain, a mono "+" for the
// fix — and the executive dashboard stays a dark product pane.


const challenges = [
  {
    icon: Eye,
    title: "Visibility Gap",
    description: "You can't see what engineering is actually delivering until quarterly reviews. Roadmaps don't match reality.",
    solution: "Real-time dashboards showing actual progress, not reported status.",
  },
  {
    icon: TrendingUp,
    title: "Hiring at Scale",
    description: "Resume-based hiring doesn't work. You keep hiring based on interviews that don't predict performance.",
    solution: "Skills-based hiring from actual code contributions and technical assessments.",
  },
  {
    icon: Users,
    title: "Retention Risk",
    description: "You don't know who's burning out until they leave. Exit interviews are too late.",
    solution: "Early warning signals from workload patterns and engagement metrics.",
  },
  {
    icon: Shield,
    title: "Tool Sprawl",
    description: "Engineering runs on 10+ disconnected tools. Data is siloed. No single source of truth.",
    solution: "One platform connecting code, planning, people, and customers.",
  },
];

const metrics = [
  { label: "Engineering Velocity", value: "+30%", desc: "Average improvement" },
  { label: "Time to Hire", value: "-40%", desc: "Reduction" },
  { label: "Planning Accuracy", value: "+50%", desc: "Sprint completion" },
  { label: "Tool Consolidation", value: "5→1", desc: "Tools replaced" },
];

export default function EngineeringLeadersPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-5xl mx-auto text-center">
          <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            <Building2 className="h-4 w-4" />
            <span>For CTOs & VPs of Engineering</span>
          </div>

          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold text-ledger-ink mb-6 tracking-tight leading-tight">
            Run engineering with <span className="text-ledger-green">clarity at scale</span>
          </h1>

          <p className="text-xl text-ledger-ink/65 mb-10 max-w-3xl mx-auto leading-relaxed">
            The Engineering OS for leaders who need visibility without micromanagement.
            One platform connecting planning, execution, people, and customers.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
            <Link
              href="/contact"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green text-ledger-paper px-8 py-4 text-lg font-semibold transition hover:bg-[#095A31]"
            >
              Schedule Demo
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
              SOC 2 compliant
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ledger-green" />
              Enterprise ready
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ledger-green" />
              Self-host option
            </span>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-4 gap-4">
            {metrics.map((metric, idx) => (
              <div key={idx} className="text-center p-6 rounded-[2px] border border-ledger-ink/12 bg-ledger-card">
                <div className="font-brand-mono text-3xl md:text-4xl font-medium text-ledger-ink mb-1">{metric.value}</div>
                <div className="text-ledger-ink font-medium mb-1">{metric.label}</div>
                <div className="text-ledger-ink/55 text-sm">{metric.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Challenges */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-ledger-ink mb-4 tracking-tight">
              The challenges you face
            </h2>
            <p className="text-ledger-ink/60 text-lg">
              And how the Engineering OS solves them.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {challenges.map((challenge, idx) => (
              <div
                key={idx}
                className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <challenge.icon className="mb-6 h-5 w-5 text-ledger-green" />
                <h3 className="font-display text-xl font-semibold text-ledger-ink mb-3">{challenge.title}</h3>
                <div className="flex items-start gap-3">
                  <span className="font-brand-mono leading-7 text-ledger-red">-</span>
                  <p className="text-ledger-ink/60 leading-7">{challenge.description}</p>
                </div>
                <div className="mt-4 flex items-start gap-3 border-t border-ledger-ink/12 pt-4">
                  <span className="font-brand-mono leading-6 text-ledger-green">+</span>
                  <p className="text-ledger-ink/85 text-sm leading-6">{challenge.solution}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Executive Dashboard Preview — a genuine product mockup, so it stays a
          dark pane (a plate in the manual). The white/* utilities inside this
          block are scoped to the pane on purpose. */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-ledger-ink mb-4 tracking-tight">
              See everything that matters
            </h2>
            <p className="text-ledger-ink/60">
              Executive dashboards built for engineering leaders.
            </p>
          </div>

          <div className="overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane text-[#E6EDE7] p-6">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Velocity Card */}
              <div className="rounded-[2px] p-5 border border-white/12">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Team Velocity</h3>
                  <TrendingUp className="h-4 w-4 text-ledger-mint" />
                </div>
                <div className="font-brand-mono text-3xl text-white mb-2">94%</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-white/10">
                    <div className="h-full w-[94%] bg-ledger-mint" />
                  </div>
                  <span className="font-brand-mono text-ledger-mint text-sm">+12%</span>
                </div>
              </div>

              {/* Delivery Card */}
              <div className="rounded-[2px] p-5 border border-white/12">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Sprint Delivery</h3>
                  <Target className="h-4 w-4 text-ledger-mint" />
                </div>
                <div className="font-brand-mono text-3xl text-white mb-2">87%</div>
                <p className="text-white/50 text-sm">8 of 9 sprints on track</p>
              </div>

              {/* Health Card */}
              <div className="rounded-[2px] p-5 border border-white/12">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Team Health</h3>
                  <Activity className="h-4 w-4 text-ledger-mint" />
                </div>
                <div className="font-brand-mono text-3xl text-white mb-2">Good</div>
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-white/60" />
                  <span className="text-white/50">1 burnout risk flagged</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Features */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-ledger-ink mb-8 text-center tracking-tight">
              Enterprise-ready from day one
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: Shield, title: "SOC 2 Type II", desc: "Compliant & audited" },
                { icon: Users, title: "SSO & SCIM", desc: "Enterprise identity" },
                { icon: Eye, title: "Audit Logs", desc: "Full visibility" },
                { icon: Layers, title: "VPC Deploy", desc: "Private cloud option" },
                { icon: Clock, title: "99.9% SLA", desc: "Enterprise support" },
                { icon: Zap, title: "API Access", desc: "Full integration" },
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 p-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-paper">
                  <item.icon className="h-5 w-5 text-ledger-green flex-shrink-0" />
                  <div>
                    <h3 className="text-ledger-ink font-medium">{item.title}</h3>
                    <p className="text-ledger-ink/55 text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-ledger-ink mb-4 tracking-tight">
            Ready to transform your engineering organization?
          </h2>
          <p className="text-xl text-ledger-ink/60 mb-10">
            Let&apos;s discuss how the Engineering OS can help.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="mailto:sales@aexy.io"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green text-ledger-paper px-8 py-4 text-lg font-semibold transition hover:bg-[#095A31]"
            >
              Talk to Sales
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 text-ledger-ink px-8 py-4 text-lg font-semibold transition hover:border-ledger-ink/50"
            >
              Try Free First
            </Link>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

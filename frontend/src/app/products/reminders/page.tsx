"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Calendar,
  Users,
  Zap,
  AlertTriangle,
  Shield,
  Github,
  FileCheck,
  Repeat,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";


const features = [
  {
    icon: Repeat,
    title: "Smart Scheduling",
    description: "Set up one-time, daily, weekly, monthly, quarterly, or custom cron schedules. Never miss a compliance deadline again.",
  },
  {
    icon: Users,
    title: "Intelligent Assignment",
    description: "Auto-assign to fixed owners, round-robin between teams, integrate with on-call schedules, or use domain-based rules.",
  },
  {
    icon: AlertTriangle,
    title: "Escalation Workflows",
    description: "Multi-level escalation chains ensure nothing falls through the cracks. Get notified via Slack, email, or in-app.",
  },
  {
    icon: FileCheck,
    title: "Evidence Tracking",
    description: "Attach completion evidence, notes, and documentation. Build an audit trail for compliance requirements.",
  },
];

const categories = [
  { name: "Compliance", icon: Shield },
  { name: "Security", icon: AlertTriangle },
  { name: "Audit", icon: FileCheck },
  { name: "Training", icon: UserCheck },
  { name: "Maintenance", icon: Repeat },
  { name: "Reporting", icon: TrendingUp },
];

const useCases = [
  {
    title: "SOC 2 Compliance",
    description: "Track quarterly access reviews, annual penetration tests, and continuous monitoring requirements.",
    items: ["Access reviews", "Penetration testing", "Vendor assessments"],
  },
  {
    title: "Security Operations",
    description: "Never miss certificate renewals, vulnerability scans, or security training deadlines.",
    items: ["Certificate renewals", "Vulnerability scans", "Security training"],
  },
  {
    title: "Team Management",
    description: "Schedule recurring 1:1s, performance reviews, and team retrospectives.",
    items: ["Performance reviews", "1:1 meetings", "Retrospectives"],
  },
];

export default function RemindersProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Bell className="h-4 w-4" />
                <span>Compliance Reminders</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Never miss a{" "}
                <span className="text-ledger-green">compliance deadline</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                Track recurring compliance commitments, scheduled reviews, and periodic tasks
                with smart assignment, escalation workflows, and evidence tracking.
              </p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  Start Tracking Free
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/pricing"
                  className="group inline-flex items-center justify-center gap-2 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-medium text-ledger-ink transition hover:border-ledger-ink/50"
                >
                  See pricing
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-ledger-ink/55">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Smart scheduling
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Auto-escalation
                </span>
              </div>
            </div>

            {/* Visual - Dashboard Preview.

                DARK PANE: a genuine product mockup — the reminder queue as the
                app renders it — so it keeps the plate treatment used for product
                UI on the paper page (see OsConsolePreview): ledger-pane ground,
                white-opacity type, ledger-mint as the only accent. The white/*
                utilities below are intentional inside bg-ledger-pane. */}
            <div className="overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane text-[#E6EDE7]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    {categories.slice(0, 4).map((cat, idx) => (
                      <span key={idx} className="flex items-center gap-1 rounded-[2px] border border-white/12 px-2 py-1">
                        <cat.icon className="h-3 w-3 text-ledger-mint" />
                        <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">{cat.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">
                  <Calendar className="h-3 w-3" />
                  February 2024
                </div>
              </div>
              {/* Reminder List */}
              <div className="divide-y divide-white/10">
                {[
                  { name: "Quarterly Access Review", category: "Compliance", status: "pending", due: "Feb 15", priority: "high" },
                  { name: "SSL Certificate Renewal", category: "Security", status: "pending", due: "Feb 20", priority: "critical" },
                  { name: "SOC 2 Evidence Collection", category: "Audit", status: "completed", due: "Feb 10", priority: "high" },
                  { name: "Security Awareness Training", category: "Training", status: "overdue", due: "Feb 1", priority: "medium" },
                ].map((reminder, idx) => (
                  <div key={idx} className="flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-white/[0.03]">
                    <div className={`h-2 w-2 rounded-full ${
                      reminder.status === "completed" ? "bg-ledger-mint" :
                      reminder.status === "overdue" ? "animate-pulse bg-white/70" :
                      "bg-white/30"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-white/85">{reminder.name}</span>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-[2px] border border-white/12 px-1.5 py-0.5 font-brand-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
                          {reminder.category}
                        </span>
                        <span className={`rounded-[2px] px-1.5 py-0.5 font-brand-mono text-[10px] uppercase tracking-[0.14em] ${
                          reminder.priority === "critical" ? "bg-white/12 text-white/85" :
                          reminder.priority === "high" ? "border border-white/12 text-white/70" :
                          "border border-white/12 text-white/50"
                        }`}>
                          {reminder.priority}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`font-brand-mono text-xs uppercase tracking-[0.14em] ${
                        reminder.status === "completed" ? "text-ledger-mint" :
                        reminder.status === "overdue" ? "text-white/85" :
                        "text-white/55"
                      }`}>
                        {reminder.status === "completed" ? "Done" : reminder.status === "overdue" ? "Overdue" : "Due"}
                      </span>
                      <p className="font-brand-mono text-[11px] text-white/50">{reminder.due}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Stats Footer */}
              <div className="grid grid-cols-4 gap-4 border-t border-white/10 p-4">
                <div className="text-center">
                  <div className="font-brand-mono text-lg text-white">24</div>
                  <div className="font-brand-mono text-[10px] uppercase tracking-[0.14em] text-white/50">Active</div>
                </div>
                <div className="text-center">
                  <div className="font-brand-mono text-lg text-white/70">8</div>
                  <div className="font-brand-mono text-[10px] uppercase tracking-[0.14em] text-white/50">Pending</div>
                </div>
                <div className="text-center">
                  <div className="font-brand-mono text-lg text-white/85">2</div>
                  <div className="font-brand-mono text-[10px] uppercase tracking-[0.14em] text-white/50">Overdue</div>
                </div>
                <div className="text-center">
                  <div className="font-brand-mono text-lg text-ledger-mint">85%</div>
                  <div className="font-brand-mono text-[10px] uppercase tracking-[0.14em] text-white/50">On-time</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Everything you need for compliance tracking
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              From simple reminders to complex escalation workflows with evidence tracking.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <feature.icon className="mb-6 h-5 w-5 text-ledger-green" />
                <h3 className="mb-3 font-display text-xl font-semibold">{feature.title}</h3>
                <p className="text-ledger-ink/65">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Built for engineering teams
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              Track any recurring task - from SOC 2 compliance to team retrospectives.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {useCases.map((useCase, idx) => (
              <div
                key={idx}
                className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <h3 className="mb-2 font-display text-lg font-semibold">{useCase.title}</h3>
                <p className="mb-4 text-sm leading-6 text-ledger-ink/60">{useCase.description}</p>
                <ul className="space-y-2">
                  {useCase.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="flex items-center gap-2 text-sm text-ledger-ink/75">
                      <span className="font-brand-mono text-base leading-none text-ledger-green">+</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Automatic escalation when things slip
                </h2>
                <p className="mb-6 text-ledger-ink/65">
                  Configure multi-level escalation chains. If a reminder goes overdue,
                  the right people get notified automatically - from team leads to directors.
                </p>
                <div className="space-y-4">
                  {[
                    { step: "1", title: "Reminder due", desc: "Owner notified" },
                    { step: "2", title: "24h overdue (L1)", desc: "Team lead notified" },
                    { step: "3", title: "48h overdue (L2)", desc: "Manager + Slack alert" },
                    { step: "4", title: "72h overdue (L3)", desc: "Director notified" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-4">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[2px] border border-ledger-ink/25 bg-ledger-paper font-brand-mono text-sm text-ledger-green">
                        {item.step}
                      </div>
                      <div>
                        <h4 className="font-medium">{item.title}</h4>
                        <p className="text-sm text-ledger-ink/55">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-center">
                <div className="inline-flex flex-col items-center gap-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-6">
                  <div className="flex items-center gap-3">
                    <Bell className="h-8 w-8 text-ledger-green" />
                    <ArrowRight className="h-5 w-5 text-ledger-ink/45" />
                    <AlertTriangle className="h-8 w-8 text-ledger-green" />
                    <ArrowRight className="h-5 w-5 text-ledger-ink/45" />
                    <Zap className="h-8 w-8 text-ledger-red" />
                  </div>
                  <div className="font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/55">
                    Progressive escalation
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Start tracking compliance today
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            Free for unlimited reminders. No credit card required.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
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

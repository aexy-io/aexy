"use client";

import Link from "next/link";
import {
  ArrowRight,
  Target,
  Activity,
  Clock,
  Users,
  TrendingUp,
  BarChart3,
  Eye,
  Zap,
  CheckCircle2,
  Code2,
  GitCommit,
  GitPullRequest,
  PieChart,
  AlertTriangle,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";


const features = [
  {
    icon: Activity,
    title: "Real-time Activity Tracking",
    description: "See what your team is working on as it happens. Commits, PRs, and code reviews sync automatically.",
  },
  {
    icon: Users,
    title: "Developer Profiles",
    description: "AI-generated skill profiles from actual code contributions. Know your team's true expertise.",
  },
  {
    icon: TrendingUp,
    title: "Trend Analysis",
    description: "Track productivity patterns over time. Identify bottlenecks before they become problems.",
  },
  {
    icon: PieChart,
    title: "Contribution Insights",
    description: "Understand how work is distributed across the team. Balance workloads effectively.",
  },
];

const metrics = [
  { label: "Commits tracked", value: "10M+", icon: GitCommit },
  { label: "PRs analyzed", value: "2M+", icon: GitPullRequest },
  { label: "Skills extracted", value: "50+", icon: Code2 },
  { label: "Time saved/week", value: "5hrs", icon: Clock },
];

export default function TrackingProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Target className="h-4 w-4" />
                <span>Activity Tracking</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Know what your team is{" "}
                <span className="text-ledger-green">actually building</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                Real-time visibility into engineering activity. Automatic skill profiling from code.
                No manual status updates. No surveillance. Just clarity.
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
                  GitHub sync in seconds
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  No code access needed
                </span>
              </div>
            </div>

            {/* Visual - Live activity feed.

                DARK PANE: a genuine product mockup — the activity stream as the
                app renders it — so it keeps the plate treatment used for product
                UI on the paper page (see OsConsolePreview): ledger-pane ground,
                white-opacity type, ledger-mint as the only accent. The white/*
                utilities below are intentional inside bg-ledger-pane. */}
            <div className="space-y-3 rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-medium">Live Activity</h3>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-ledger-mint" />
                  <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">Live</span>
                </div>
              </div>
              {[
                { user: "Sarah", action: "Merged PR #234", time: "2m ago", icon: GitPullRequest },
                { user: "Mike", action: "Pushed 3 commits", time: "5m ago", icon: GitCommit },
                { user: "Alex", action: "Started code review", time: "8m ago", icon: Eye },
                { user: "Jordan", action: "Closed issue #89", time: "12m ago", icon: CheckCircle2 },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-4 rounded-[2px] border border-white/12 p-3">
                  <item.icon className="h-4 w-4 shrink-0 text-ledger-mint" />
                  <div className="flex-1">
                    <p className="text-[13px]">
                      <span className="font-medium text-white/85">{item.user}</span>{" "}
                      <span className="text-white/60">{item.action}</span>
                    </p>
                  </div>
                  <span className="font-brand-mono text-[11px] text-white/50">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {metrics.map((metric, idx) => (
              <div key={idx} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 text-center">
                <metric.icon className="mx-auto mb-3 h-5 w-5 text-ledger-green" />
                <div className="mb-1 font-brand-mono text-3xl text-ledger-ink">{metric.value}</div>
                <div className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-ink/55">{metric.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Everything you need to understand your team
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              Automatic tracking that respects developer autonomy while giving leaders the visibility they need.
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

      {/* How It Works */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              How tracking works
            </h2>
          </div>

          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 md:p-12">
            <div className="grid gap-8 md:grid-cols-3">
              {[
                { step: "1", title: "Connect GitHub", desc: "One-click OAuth connection. Read-only access to metadata only.", icon: Code2 },
                { step: "2", title: "Auto-Profile", desc: "AI analyzes commits and PRs to build skill profiles automatically.", icon: Zap },
                { step: "3", title: "See Everything", desc: "Real-time dashboards show team activity, skills, and trends.", icon: BarChart3 },
              ].map((item, idx) => (
                <div key={idx} className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-[2px] border border-ledger-ink/25 bg-ledger-paper">
                    <item.icon className="h-5 w-5 text-ledger-green" />
                    <span className="font-brand-mono text-[10px] uppercase tracking-[0.14em] text-ledger-ink/55">{item.step}</span>
                  </div>
                  <h3 className="mb-2 font-display text-lg font-semibold">{item.title}</h3>
                  <p className="text-sm leading-6 text-ledger-ink/55">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Not Surveillance */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <div className="mb-6 flex items-start gap-4">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-ledger-green" />
              <div>
                <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Tracking, not surveillance
                </h2>
                <p className="mb-6 text-lg text-ledger-ink/65">
                  We built Aexy because we believe visibility should empower teams, not monitor them.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                "No keystroke logging",
                "No screen recording",
                "No productivity scores",
                "No individual rankings",
                "Open source & auditable",
                "Developers control their data",
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-4">
                  <span className="font-brand-mono text-base leading-none text-ledger-green">+</span>
                  <span className="text-ledger-ink/75">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Start understanding your engineering team today
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            Connect GitHub and see insights in minutes. Free forever for small teams.
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
              View on GitHub
            </a>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

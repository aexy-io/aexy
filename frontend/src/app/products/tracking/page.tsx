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
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Activity,
    title: "Real-time Activity Tracking",
    description: "See what your team is working on as it happens. Commits, PRs, and code reviews sync automatically.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Users,
    title: "Developer Profiles",
    description: "AI-generated skill profiles from actual code contributions. Know your team's true expertise.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: TrendingUp,
    title: "Trend Analysis",
    description: "Track productivity patterns over time. Identify bottlenecks before they become problems.",
    color: "from-purple-500 to-pink-500",
  },
  {
    icon: PieChart,
    title: "Contribution Insights",
    description: "Understand how work is distributed across the team. Balance workloads effectively.",
    color: "from-amber-500 to-orange-500",
  },
];

const metrics = [
  { label: "Commits tracked", value: "10M+", icon: GitCommit },
  { label: "PRs analyzed", value: "2M+", icon: GitPullRequest },
  { label: "Skills extracted", value: "50+", icon: Code2 },
  { label: "Time saved/week", value: "5hrs", icon: Clock },
];

export default function TrackingProductPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm mb-6">
                <Target className="h-4 w-4" />
                <span>Activity Tracking</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Know what your team is{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  actually building
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                Real-time visibility into engineering activity. Automatic skill profiling from code.
                No manual status updates. No surveillance. Just clarity.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(16,185,129,0.3)]"
                >
                  Start Tracking Free
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </a>
                <Link
                  href="/manifesto"
                  className="group inline-flex items-center justify-center gap-2 bg-white/5 text-white px-8 py-4 rounded-full text-lg font-medium border border-white/10 hover:border-white/20 transition-all"
                >
                  Learn More
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-white/40">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  GitHub sync in seconds
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  No code access needed
                </span>
              </div>
            </div>

            {/* Visual */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-4">
                {/* Activity Feed Preview */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-medium">Live Activity</h3>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-emerald-400 text-xs">Live</span>
                  </div>
                </div>
                {[
                  { user: "Sarah", action: "Merged PR #234", time: "2m ago", icon: GitPullRequest, color: "text-purple-400" },
                  { user: "Mike", action: "Pushed 3 commits", time: "5m ago", icon: GitCommit, color: "text-emerald-400" },
                  { user: "Alex", action: "Started code review", time: "8m ago", icon: Eye, color: "text-blue-400" },
                  { user: "Jordan", action: "Closed issue #89", time: "12m ago", icon: CheckCircle2, color: "text-amber-400" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-full flex items-center justify-center">
                      <item.icon className={`h-5 w-5 ${item.color}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-sm">
                        <span className="font-medium">{item.user}</span>{" "}
                        <span className="text-white/60">{item.action}</span>
                      </p>
                    </div>
                    <span className="text-white/40 text-xs">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {metrics.map((metric, idx) => (
              <div key={idx} className="text-center p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10">
                <metric.icon className="h-8 w-8 text-emerald-400 mx-auto mb-3" />
                <div className="text-3xl font-bold text-white mb-1">{metric.value}</div>
                <div className="text-white/50 text-sm">{metric.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Everything you need to understand your team
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Automatic tracking that respects developer autonomy while giving leaders the visibility they need.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, idx) => (
              <div key={idx} className="group relative">
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} rounded-3xl opacity-0 group-hover:opacity-10 blur-xl transition-all duration-500`} />
                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all h-full">
                  <div className={`p-4 bg-gradient-to-br ${feature.color} rounded-2xl w-fit mb-6`}>
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                  <p className="text-white/60">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              How tracking works
            </h2>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-8 md:p-12 border border-white/10">
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { step: "1", title: "Connect GitHub", desc: "One-click OAuth connection. Read-only access to metadata only.", icon: Code2 },
                  { step: "2", title: "Auto-Profile", desc: "AI analyzes commits and PRs to build skill profiles automatically.", icon: Zap },
                  { step: "3", title: "See Everything", desc: "Real-time dashboards show team activity, skills, and trends.", icon: BarChart3 },
                ].map((item, idx) => (
                  <div key={idx} className="text-center">
                    <div className="relative w-16 h-16 mx-auto mb-4">
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl" />
                      <div className="absolute inset-0 flex items-center justify-center text-white">
                        <item.icon className="h-7 w-7" />
                      </div>
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-white text-black rounded-full flex items-center justify-center text-xs font-bold">
                        {item.step}
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                    <p className="text-white/50 text-sm">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Not Surveillance */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="flex items-start gap-4 mb-6">
                <AlertTriangle className="h-8 w-8 text-amber-400 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    Tracking, not surveillance
                  </h2>
                  <p className="text-white/60 text-lg mb-6">
                    We built Aexy because we believe visibility should empower teams, not monitor them.
                  </p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  "No keystroke logging",
                  "No screen recording",
                  "No productivity scores",
                  "No individual rankings",
                  "Open source & auditable",
                  "Developers control their data",
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-4 bg-white/5 rounded-xl">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-white/80">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Start understanding your engineering team today
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Connect GitHub and see insights in minutes. Free forever for small teams.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

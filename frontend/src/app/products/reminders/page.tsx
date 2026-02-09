"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
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
  Layers,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Repeat,
    title: "Smart Scheduling",
    description: "Set up one-time, daily, weekly, monthly, quarterly, or custom cron schedules. Never miss a compliance deadline again.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Users,
    title: "Intelligent Assignment",
    description: "Auto-assign to fixed owners, round-robin between teams, integrate with on-call schedules, or use domain-based rules.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: AlertTriangle,
    title: "Escalation Workflows",
    description: "Multi-level escalation chains ensure nothing falls through the cracks. Get notified via Slack, email, or in-app.",
    color: "from-amber-500 to-orange-500",
  },
  {
    icon: FileCheck,
    title: "Evidence Tracking",
    description: "Attach completion evidence, notes, and documentation. Build an audit trail for compliance requirements.",
    color: "from-emerald-500 to-teal-500",
  },
];

const categories = [
  { name: "Compliance", color: "bg-blue-500", icon: Shield },
  { name: "Security", color: "bg-red-500", icon: AlertTriangle },
  { name: "Audit", color: "bg-cyan-500", icon: FileCheck },
  { name: "Training", color: "bg-green-500", icon: UserCheck },
  { name: "Maintenance", color: "bg-amber-500", icon: Repeat },
  { name: "Reporting", color: "bg-indigo-500", icon: TrendingUp },
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
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-full text-blue-400 text-sm mb-6">
                <Bell className="h-4 w-4" />
                <span>Compliance Reminders</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Never miss a{" "}
                <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  compliance deadline
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                Track recurring compliance commitments, scheduled reviews, and periodic tasks
                with smart assignment, escalation workflows, and evidence tracking.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(59,130,246,0.3)]"
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
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Smart scheduling
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Auto-escalation
                </span>
              </div>
            </div>

            {/* Visual - Dashboard Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2">
                      {categories.slice(0, 4).map((cat, idx) => (
                        <span key={idx} className={`px-2 py-1 ${cat.color}/20 rounded text-xs flex items-center gap-1`}>
                          <cat.icon className={`h-3 w-3 ${cat.color.replace('bg-', 'text-')}`} />
                          <span className="text-white/60">{cat.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-blue-400">
                    <Calendar className="w-3 h-3" />
                    February 2024
                  </div>
                </div>
                {/* Reminder List */}
                <div className="divide-y divide-white/5">
                  {[
                    { name: "Quarterly Access Review", category: "Compliance", status: "pending", due: "Feb 15", priority: "high" },
                    { name: "SSL Certificate Renewal", category: "Security", status: "pending", due: "Feb 20", priority: "critical" },
                    { name: "SOC 2 Evidence Collection", category: "Audit", status: "completed", due: "Feb 10", priority: "high" },
                    { name: "Security Awareness Training", category: "Training", status: "overdue", due: "Feb 1", priority: "medium" },
                  ].map((reminder, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors cursor-pointer">
                      <div className={`w-3 h-3 rounded-full ${
                        reminder.status === "completed" ? "bg-emerald-500" :
                        reminder.status === "overdue" ? "bg-red-500 animate-pulse" :
                        "bg-amber-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-white text-sm font-medium">{reminder.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            reminder.category === "Compliance" ? "bg-blue-500/20 text-blue-400" :
                            reminder.category === "Security" ? "bg-red-500/20 text-red-400" :
                            reminder.category === "Audit" ? "bg-cyan-500/20 text-cyan-400" :
                            "bg-green-500/20 text-green-400"
                          }`}>
                            {reminder.category}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            reminder.priority === "critical" ? "bg-red-500/20 text-red-400" :
                            reminder.priority === "high" ? "bg-amber-500/20 text-amber-400" :
                            "bg-slate-500/20 text-slate-400"
                          }`}>
                            {reminder.priority}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-medium ${
                          reminder.status === "completed" ? "text-emerald-400" :
                          reminder.status === "overdue" ? "text-red-400" :
                          "text-white/60"
                        }`}>
                          {reminder.status === "completed" ? "Done" : reminder.status === "overdue" ? "Overdue" : "Due"}
                        </span>
                        <p className="text-xs text-white/40">{reminder.due}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Stats Footer */}
                <div className="grid grid-cols-4 gap-4 p-4 border-t border-white/5 bg-white/5">
                  <div className="text-center">
                    <div className="text-lg font-bold text-white">24</div>
                    <div className="text-[10px] text-white/40">Active</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-amber-400">8</div>
                    <div className="text-[10px] text-white/40">Pending</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-400">2</div>
                    <div className="text-[10px] text-white/40">Overdue</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-emerald-400">85%</div>
                    <div className="text-[10px] text-white/40">On-time</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Everything you need for compliance tracking
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              From simple reminders to complex escalation workflows with evidence tracking.
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

      {/* Use Cases */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Built for engineering teams
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Track any recurring task - from SOC 2 compliance to team retrospectives.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {useCases.map((useCase, idx) => (
              <div key={idx} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all">
                <h3 className="text-lg font-bold text-white mb-2">{useCase.title}</h3>
                <p className="text-white/50 text-sm mb-4">{useCase.description}</p>
                <ul className="space-y-2">
                  {useCase.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="flex items-center gap-2 text-sm text-white/70">
                      <CheckCircle2 className="h-4 w-4 text-blue-400" />
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
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    Automatic escalation when things slip
                  </h2>
                  <p className="text-white/60 mb-6">
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
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                          idx === 0 ? "bg-blue-500/20 text-blue-400" :
                          idx === 1 ? "bg-amber-500/20 text-amber-400" :
                          idx === 2 ? "bg-orange-500/20 text-orange-400" :
                          "bg-red-500/20 text-red-400"
                        }`}>
                          {item.step}
                        </div>
                        <div>
                          <h4 className="text-white font-medium">{item.title}</h4>
                          <p className="text-white/50 text-sm">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-center">
                  <div className="inline-flex flex-col items-center gap-4 p-6 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex items-center gap-3">
                      <Bell className="h-8 w-8 text-blue-400" />
                      <ArrowRight className="h-5 w-5 text-white/30" />
                      <AlertTriangle className="h-8 w-8 text-amber-400" />
                      <ArrowRight className="h-5 w-5 text-white/30" />
                      <Zap className="h-8 w-8 text-red-400" />
                    </div>
                    <div className="text-white/60 text-sm">
                      Progressive escalation
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Start tracking compliance today
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Free for unlimited reminders. No credit card required.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              <Github className="h-5 w-5" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

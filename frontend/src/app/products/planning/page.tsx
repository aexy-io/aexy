"use client";

import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Layers,
  Target,
  Users,
  Zap,
  CheckCircle2,
  Clock,
  BarChart3,
  Kanban,
  ListTodo,
  Timer,
  TrendingUp,
  Bot,
  Sparkles,
  GitPullRequest,
  Github,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Kanban,
    title: "Visual Sprint Planning",
    description: "Drag-and-drop kanban boards. Plan sprints visually with real capacity data from your team.",
    color: "from-green-500 to-emerald-500",
  },
  {
    icon: Layers,
    title: "Epic & Initiative Tracking",
    description: "Create epics spanning multiple sprints. Track progress across projects with automatic rollups.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: Bot,
    title: "AI Task Assignment",
    description: "Intelligent task matching based on developer skills and current workload. Never over-allocate again.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: TrendingUp,
    title: "Velocity Analytics",
    description: "Track sprint velocity, predict completion dates, and identify patterns over time.",
    color: "from-amber-500 to-orange-500",
  },
];

const integrations = [
  { name: "Jira", desc: "Two-way sync with Jira projects" },
  { name: "Linear", desc: "Native Linear integration" },
  { name: "GitHub Issues", desc: "Sync with GitHub Issues" },
  { name: "Asana", desc: "Import from Asana" },
];

export default function PlanningProductPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-green-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-full text-green-400 text-sm mb-6">
                <Calendar className="h-4 w-4" />
                <span>Sprint Planning</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Planning that{" "}
                <span className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                  reflects reality
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                Sprint planning powered by real team capacity. AI-driven task assignment.
                Automatic sync with GitHub, Jira, and Linear. No more guessing games.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(34,197,94,0.3)]"
                >
                  Start Planning Free
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
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Import from Jira/Linear
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  AI capacity planning
                </span>
              </div>
            </div>

            {/* Visual - Kanban Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white font-medium">Sprint 24 - Mobile App</h3>
                  <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">67% Complete</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { title: "To Do", tasks: [{ name: "API endpoints", tag: "Backend" }, { name: "Tests", tag: "QA" }] },
                    { title: "In Progress", tasks: [{ name: "Dashboard UI", tag: "Frontend" }] },
                    { title: "Done", tasks: [{ name: "Auth flow", tag: "Backend" }, { name: "Login page", tag: "Frontend" }] },
                  ].map((col, idx) => (
                    <div key={idx} className="space-y-3">
                      <div className="text-white/40 text-xs font-medium uppercase tracking-wider">{col.title}</div>
                      {col.tasks.map((task, tidx) => (
                        <div key={tidx} className="p-3 bg-white/5 rounded-lg border border-white/5">
                          <p className="text-white text-sm mb-2">{task.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded ${idx === 2 ? "bg-green-500/20 text-green-400" : idx === 1 ? "bg-blue-500/20 text-blue-400" : "bg-white/10 text-white/40"}`}>
                            {task.tag}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
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
              Planning that actually works
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Built by engineering leaders who were tired of plans that never matched reality.
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

      {/* AI Assignment */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 rounded-full text-blue-400 text-xs mb-4">
                    <Sparkles className="h-3 w-3" />
                    AI-POWERED
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    Smart task assignment
                  </h2>
                  <p className="text-white/60 mb-6">
                    Our AI analyzes developer skills from their actual code contributions and matches tasks to the best-suited team members automatically.
                  </p>
                  <ul className="space-y-3">
                    {[
                      "Matches tasks to developer expertise",
                      "Balances workload across the team",
                      "Suggests optimal sprint capacity",
                      "Learns from historical patterns",
                    ].map((item, idx) => (
                      <li key={idx} className="flex items-center gap-3 text-white/70">
                        <CheckCircle2 className="h-5 w-5 text-blue-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <Bot className="h-6 w-6 text-blue-400" />
                    <span className="text-white font-medium">AI Suggestion</span>
                  </div>
                  <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20 mb-4">
                    <p className="text-white/80 text-sm">
                      &ldquo;Assign <span className="text-blue-400">API refactoring</span> to <span className="text-green-400">Sarah</span> -
                      95% match based on Node.js expertise and current capacity.&rdquo;
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg font-medium">Accept</button>
                    <button className="px-4 py-2 bg-white/10 text-white/60 text-sm rounded-lg">Dismiss</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Works with your existing tools
            </h2>
            <p className="text-white/50">Import from anywhere, sync everywhere.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {integrations.map((int, idx) => (
              <div key={idx} className="p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 text-center hover:border-white/20 transition-all">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <GitPullRequest className="h-6 w-6 text-green-400" />
                </div>
                <h3 className="text-white font-medium mb-1">{int.name}</h3>
                <p className="text-white/40 text-xs">{int.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Transform your sprint planning
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Join thousands of teams planning smarter with Aexy.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            >
              Start Planning Free
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

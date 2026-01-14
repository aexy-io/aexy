"use client";

import Link from "next/link";
import {
  ArrowRight,
  Ticket,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Zap,
  Filter,
  Tag,
  MessageSquare,
  Link2,
  Bell,
  Workflow,
  Bot,
  ArrowUpRight,
  CircleDot,
  Github,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Workflow,
    title: "Custom Workflows",
    description: "Define your own ticket statuses and transitions. Build workflows that match how your team actually works.",
    color: "from-pink-500 to-rose-500",
  },
  {
    icon: Link2,
    title: "Deep Linking",
    description: "Link tickets to PRs, commits, epics, and sprints. Everything connected, nothing lost.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: Bot,
    title: "AI Triage",
    description: "Automatic priority assignment, duplicate detection, and smart routing to the right team.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Bell,
    title: "Smart Notifications",
    description: "Get notified about what matters. Customizable alerts based on priority, assignee, or label changes.",
    color: "from-amber-500 to-orange-500",
  },
];

const ticketTypes = [
  { name: "Bug", color: "bg-red-500", icon: AlertCircle },
  { name: "Feature", color: "bg-purple-500", icon: Zap },
  { name: "Task", color: "bg-blue-500", icon: CheckCircle2 },
  { name: "Epic", color: "bg-amber-500", icon: CircleDot },
];

export default function TicketsProductPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-pink-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-rose-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500/20 to-rose-500/20 border border-pink-500/30 rounded-full text-pink-400 text-sm mb-6">
                <Ticket className="h-4 w-4" />
                <span>Issue Tracking</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Ticketing that{" "}
                <span className="bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
                  developers love
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                Fast, flexible issue tracking built for engineering teams.
                Keyboard-first, deeply integrated with your code, and powered by AI for smart routing.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(236,72,153,0.3)]"
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
                  <CheckCircle2 className="h-4 w-4 text-pink-500" />
                  Keyboard shortcuts
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-pink-500" />
                  GitHub integration
                </span>
              </div>
            </div>

            {/* Visual - Ticket List Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-rose-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center gap-3 p-4 border-b border-white/5">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg">
                    <Filter className="h-4 w-4 text-white/40" />
                    <span className="text-white/60 text-sm">Filter</span>
                  </div>
                  <div className="flex gap-2">
                    {ticketTypes.map((type, idx) => (
                      <span key={idx} className={`px-2 py-1 ${type.color}/20 rounded text-xs flex items-center gap-1`}>
                        <type.icon className={`h-3 w-3 ${type.color.replace('bg-', 'text-')}`} />
                        <span className="text-white/60">{type.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
                {/* Ticket List */}
                <div className="divide-y divide-white/5">
                  {[
                    { id: "AEXY-234", title: "Fix login redirect loop", type: "Bug", priority: "High", assignee: "SM" },
                    { id: "AEXY-235", title: "Add dark mode toggle", type: "Feature", priority: "Medium", assignee: "JD" },
                    { id: "AEXY-236", title: "Update API documentation", type: "Task", priority: "Low", assignee: "AK" },
                    { id: "AEXY-237", title: "Refactor authentication module", type: "Epic", priority: "High", assignee: "SM" },
                  ].map((ticket, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors cursor-pointer">
                      <div className={`w-2 h-2 rounded-full ${ticket.priority === "High" ? "bg-red-500" : ticket.priority === "Medium" ? "bg-amber-500" : "bg-green-500"}`} />
                      <span className="text-white/40 text-sm font-mono">{ticket.id}</span>
                      <span className="text-white flex-1 text-sm">{ticket.title}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${ticket.type === "Bug" ? "bg-red-500/20 text-red-400" : ticket.type === "Feature" ? "bg-purple-500/20 text-purple-400" : ticket.type === "Epic" ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"}`}>
                        {ticket.type}
                      </span>
                      <div className="w-7 h-7 bg-gradient-to-br from-pink-500/30 to-rose-500/30 rounded-full flex items-center justify-center text-white text-xs font-medium">
                        {ticket.assignee}
                      </div>
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
              Everything you need to track work
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Powerful enough for complex projects, simple enough for everyday use.
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

      {/* Keyboard First */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-pink-500/10 to-rose-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    Keyboard-first experience
                  </h2>
                  <p className="text-white/60 mb-6">
                    Navigate, search, and manage tickets without touching your mouse.
                    Built for developers who value speed.
                  </p>
                  <div className="space-y-3">
                    {[
                      { key: "C", action: "Create new ticket" },
                      { key: "/", action: "Quick search" },
                      { key: "G I", action: "Go to inbox" },
                      { key: "A", action: "Assign ticket" },
                    ].map((shortcut, idx) => (
                      <div key={idx} className="flex items-center gap-4">
                        <kbd className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white text-sm font-mono">
                          {shortcut.key}
                        </kbd>
                        <span className="text-white/60">{shortcut.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 rounded-xl border border-white/10">
                    <span className="text-white/40 text-sm">Press</span>
                    <kbd className="px-3 py-1.5 bg-white/20 rounded-lg text-white text-sm font-mono">?</kbd>
                    <span className="text-white/40 text-sm">for all shortcuts</span>
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
            Start tracking issues the right way
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Fast, flexible, and built for engineering teams.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
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

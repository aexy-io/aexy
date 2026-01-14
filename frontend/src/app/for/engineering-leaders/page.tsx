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
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-violet-500/20 border border-purple-500/30 rounded-full text-purple-400 text-sm mb-6">
            <Building2 className="h-4 w-4" />
            <span>For CTOs & VPs of Engineering</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            Run engineering with{" "}
            <span className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">
              clarity at scale
            </span>
          </h1>

          <p className="text-xl text-white/60 mb-10 max-w-3xl mx-auto leading-relaxed">
            The Engineering OS for leaders who need visibility without micromanagement.
            One platform connecting planning, execution, people, and customers.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-purple-500 to-violet-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(139,92,246,0.3)]"
            >
              Schedule Demo
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <Link
              href="/manifesto"
              className="group inline-flex items-center justify-center gap-2 bg-white/5 text-white px-8 py-4 rounded-full text-lg font-medium border border-white/10 hover:border-white/20 transition-all"
            >
              Read the Manifesto
            </Link>
          </div>

          <div className="flex items-center justify-center gap-8 text-sm text-white/40">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-purple-500" />
              SOC 2 compliant
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-purple-500" />
              Enterprise ready
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-purple-500" />
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
              <div key={idx} className="text-center p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10">
                <div className="text-3xl md:text-4xl font-bold text-white mb-1">{metric.value}</div>
                <div className="text-white font-medium mb-1">{metric.label}</div>
                <div className="text-white/40 text-sm">{metric.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Challenges */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              The challenges you face
            </h2>
            <p className="text-white/50 text-lg">
              And how the Engineering OS solves them.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {challenges.map((challenge, idx) => (
              <div key={idx} className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-violet-500/20 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500" />
                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-purple-500/30 transition-all h-full">
                  <div className="p-4 bg-gradient-to-br from-purple-500 to-violet-500 rounded-2xl w-fit mb-6">
                    <challenge.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{challenge.title}</h3>
                  <p className="text-white/50 mb-4">{challenge.description}</p>
                  <div className="flex items-start gap-2 p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <p className="text-emerald-400 text-sm">{challenge.solution}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Executive Dashboard Preview */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              See everything that matters
            </h2>
            <p className="text-white/50">
              Executive dashboards built for engineering leaders.
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-3xl blur-2xl" />
            <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="grid md:grid-cols-3 gap-6">
                {/* Velocity Card */}
                <div className="bg-white/5 rounded-xl p-5 border border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white/60 text-sm">Team Velocity</h3>
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="text-3xl font-bold text-white mb-2">94%</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-white/10 rounded-full">
                      <div className="h-full w-[94%] bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" />
                    </div>
                    <span className="text-emerald-400 text-sm">+12%</span>
                  </div>
                </div>

                {/* Delivery Card */}
                <div className="bg-white/5 rounded-xl p-5 border border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white/60 text-sm">Sprint Delivery</h3>
                    <Target className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="text-3xl font-bold text-white mb-2">87%</div>
                  <p className="text-white/40 text-sm">8 of 9 sprints on track</p>
                </div>

                {/* Health Card */}
                <div className="bg-white/5 rounded-xl p-5 border border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white/60 text-sm">Team Health</h3>
                    <Activity className="h-4 w-4 text-purple-400" />
                  </div>
                  <div className="text-3xl font-bold text-white mb-2">Good</div>
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-white/40">1 burnout risk flagged</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Features */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-violet-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-8 text-center">
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
                  <div key={idx} className="flex items-start gap-3 p-4 bg-white/5 rounded-xl">
                    <item.icon className="h-5 w-5 text-purple-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-white font-medium">{item.title}</h3>
                      <p className="text-white/40 text-sm">{item.desc}</p>
                    </div>
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
            Ready to transform your engineering organization?
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Let&apos;s discuss how the Engineering OS can help.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="mailto:sales@aexy.io"
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-purple-500 to-violet-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            >
              Talk to Sales
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href={googleLoginUrl}
              className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              Try Free First
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

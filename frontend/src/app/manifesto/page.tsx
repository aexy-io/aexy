"use client";

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
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function ManifestoPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-emerald-500/8 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500/20 to-purple-500/20 border border-primary-500/30 rounded-full text-primary-400 text-sm mb-8">
            <Sparkles className="h-4 w-4" />
            <span>Category Manifesto</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-8 tracking-tight">
            The{" "}
            <span className="bg-gradient-to-r from-primary-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
              Engineering OS
            </span>
          </h1>

          <p className="text-2xl md:text-3xl text-white/70 max-w-3xl mx-auto leading-relaxed font-light">
            Software companies don&apos;t fail because of a lack of tools.
            <br />
            <span className="text-white font-medium">They fail because their tools don&apos;t agree on reality.</span>
          </p>
        </div>
      </section>

      {/* The Problem */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-8">The Problem</h2>
              <p className="text-xl text-white/70 mb-8 leading-relaxed">
                Modern engineering organizations run on fragments:
              </p>
              <div className="grid md:grid-cols-2 gap-4">
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
                    className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10"
                  >
                    <item.icon className="h-5 w-5 text-white/40" />
                    <span className="text-white/70">{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-10 space-y-4 text-lg text-white/60">
                <p>Each tool tells a different story.</p>
                <p>Leaders are forced to guess.</p>
                <p>Engineers are forced to explain themselves.</p>
                <p className="text-white font-medium">Trust erodes.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Lie We've Accepted */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 text-center">
            The Lie We&apos;ve Accepted
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              "Planning is separate from execution",
              "Performance is separate from work",
              "Hiring is separate from skills",
              "Customers are separate from delivery",
            ].map((lie, idx) => (
              <div
                key={idx}
                className="flex items-start gap-4 p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10"
              >
                <XCircle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
                <span className="text-white/70 text-lg">{lie}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-xl text-white/50 mt-10">
            This fragmentation is not normal.
            <br />
            <span className="text-white/70">It&apos;s historical accident.</span>
          </p>
        </div>
      </section>

      {/* The Insight */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/20 via-purple-500/20 to-emerald-500/20 rounded-3xl blur-2xl" />
            <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-16 border border-white/10 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500/20 rounded-full text-primary-400 text-sm mb-8">
                <Zap className="h-4 w-4" />
                The Insight
              </div>

              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-8 leading-tight">
                Code is the most honest data
                <br />
                an engineering organization produces.
              </h2>

              <div className="grid md:grid-cols-5 gap-4 mt-12">
                {[
                  { label: "What was actually built", icon: Code2 },
                  { label: "Who worked on it", icon: Users },
                  { label: "How teams collaborate", icon: Heart },
                  { label: "Where systems fail", icon: Target },
                  { label: "What skills truly exist", icon: Sparkles },
                ].map((item, idx) => (
                  <div key={idx} className="text-center">
                    <div className="w-12 h-12 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <item.icon className="h-5 w-5 text-primary-400" />
                    </div>
                    <p className="text-white/60 text-sm">{item.label}</p>
                  </div>
                ))}
              </div>

              <p className="text-xl text-white/50 mt-12">
                Any system that ignores this truth is incomplete.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The Engineering OS */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              The Engineering OS
            </h2>
            <p className="text-xl text-white/50">A new category.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Layers className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">System of Record</h3>
              <p className="text-white/50 text-sm">Not a reporting tool</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <GitBranch className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Platform</h3>
              <p className="text-white/50 text-sm">Not a point solution</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Shared Reality</h3>
              <p className="text-white/50 text-sm">For engineering, people, and leadership</p>
            </div>
          </div>

          {/* Connections */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 to-emerald-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-8 md:p-10 border border-white/10">
              <h3 className="text-xl font-semibold text-white mb-8 text-center">It connects:</h3>
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-2">
                {[
                  { label: "Code", color: "from-blue-500 to-cyan-500" },
                  { label: "Planning", color: "from-purple-500 to-pink-500" },
                  { label: "People", color: "from-emerald-500 to-teal-500" },
                  { label: "Growth", color: "from-amber-500 to-orange-500" },
                  { label: "Customers", color: "from-rose-500 to-red-500" },
                ].map((item, idx, arr) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className={`px-4 py-2 bg-gradient-to-r ${item.color} rounded-full text-white font-medium`}>
                      {item.label}
                    </div>
                    {idx < arr.length - 1 && (
                      <ArrowRight className="h-5 w-5 text-white/30 hidden md:block" />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-center text-white/50 mt-8">All in one place.</p>
            </div>
          </div>
        </div>
      </section>

      {/* What the Engineering OS Is Not */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-10 text-center">
            What the Engineering OS Is Not
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              "Not surveillance software",
              "Not a ticketing tool with dashboards",
              "Not a CRM with engineering add-ons",
              "Not another SaaS silo",
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 p-5 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10"
              >
                <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                <span className="text-white/70">{item}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-xl text-white mt-10">
            The Engineering OS is built on{" "}
            <span className="text-primary-400 font-medium">trust</span>,{" "}
            <span className="text-purple-400 font-medium">transparency</span>, and{" "}
            <span className="text-emerald-400 font-medium">truth</span>.
          </p>
        </div>
      </section>

      {/* Why Open Source Matters */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="flex items-center gap-3 mb-6">
                <Github className="h-8 w-8 text-emerald-400" />
                <h2 className="text-3xl md:text-4xl font-bold text-white">
                  Why Open Source Matters
                </h2>
              </div>

              <p className="text-xl text-white/70 mb-10">
                Engineering organizations don&apos;t trust black boxes - and they shouldn&apos;t.
              </p>

              <p className="text-lg text-white/50 mb-8">
                That&apos;s why the Engineering OS must be:
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { label: "Auditable", icon: Eye, color: "text-blue-600 dark:text-blue-400" },
                  { label: "Forkable", icon: GitFork, color: "text-purple-600 dark:text-purple-400" },
                  { label: "Self-hostable", icon: Server, color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Community-driven", icon: Users, color: "text-amber-600 dark:text-amber-400" },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 p-5 bg-white/5 rounded-xl border border-white/10"
                  >
                    <item.icon className={`h-5 w-5 ${item.color} flex-shrink-0`} />
                    <span className="text-white font-medium">{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="mt-10 p-6 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                <p className="text-emerald-400 text-lg font-medium text-center">
                  Trust is not a feature. It&apos;s the foundation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Outcome */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-10 text-center">
            The Outcome
          </h2>
          <div className="space-y-4">
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
                className="flex items-center gap-4 p-5 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10"
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                <span className="text-white/80 text-lg">{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center space-y-2">
            <p className="text-xl text-white/60">Less guesswork.</p>
            <p className="text-xl text-white/60">Less politics.</p>
            <p className="text-2xl text-white font-medium">More progress.</p>
          </div>
        </div>
      </section>

      {/* Our Belief */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/30 via-purple-500/30 to-emerald-500/30 rounded-3xl blur-2xl" />
            <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-3xl p-12 md:p-16 border border-white/10 text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-8">Our Belief</h2>
              <blockquote className="text-2xl md:text-3xl text-white font-medium leading-relaxed mb-8">
                &ldquo;Every modern software company will eventually run on an Engineering OS.&rdquo;
              </blockquote>
              <p className="text-white/60 text-lg">
                We&apos;re building Aexy to be that system - openly, transparently, and with the community.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Welcome to the Engineering OS.
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Start with open source. Build with clarity.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
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
              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

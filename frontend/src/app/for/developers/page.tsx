"use client";

import Link from "next/link";
import {
  ArrowRight,
  Github,
  Code2,
  CheckCircle2,
  Target,
  GraduationCap,
  Shield,
  Eye,
  Keyboard,
  Star,
  Trophy,
  GitPullRequest,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const benefits = [
  {
    icon: Shield,
    title: "No Surveillance",
    description: "We track contributions, not keystrokes. No screenshots, no productivity scores. Your work speaks for itself.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Eye,
    title: "Transparent Algorithms",
    description: "Open source means you can see exactly how we calculate everything. No black boxes.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: GraduationCap,
    title: "Grow Your Skills",
    description: "Get personalized learning paths based on skill gaps. Level up with real guidance.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: Target,
    title: "Fair Reviews",
    description: "Performance reviews backed by your actual contributions. No more politics.",
    color: "from-amber-500 to-orange-500",
  },
];

const devFeatures = [
  { title: "Keyboard-first", desc: "Navigate with shortcuts. Built for developers who hate mice.", icon: Keyboard },
  { title: "GitHub Native", desc: "Deep integration with your existing workflow. Not another tool to learn.", icon: Github },
  { title: "Skill Profiles", desc: "Auto-generated from your code. Show what you actually know.", icon: Code2 },
  { title: "Learning Paths", desc: "Gamified skill development. Earn badges, level up.", icon: Trophy },
];

export default function DevelopersPage() {
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
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm mb-6">
            <Code2 className="h-4 w-4" />
            <span>For Developers</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            Tools that{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              respect
            </span>{" "}
            developers
          </h1>

          <p className="text-xl text-white/60 mb-10 max-w-3xl mx-auto leading-relaxed">
            Finally, engineering tools that don&apos;t treat you like a resource to be monitored.
            Open source. Keyboard-first. Built by developers, for developers.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(16,185,129,0.3)]"
            >
              <Github className="h-5 w-5" />
              Sign in with GitHub
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group inline-flex items-center justify-center gap-2 bg-white/5 text-white px-8 py-4 rounded-full text-lg font-medium border border-white/10 hover:border-white/20 transition-all"
            >
              View Source
              <Star className="h-5 w-5 text-yellow-500" />
            </a>
          </div>

          <div className="flex items-center justify-center gap-8 text-sm text-white/40">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              100% open source
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Self-host free
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              No surveillance
            </span>
          </div>
        </div>
      </section>

      {/* Dev Features */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-4 gap-4">
            {devFeatures.map((feature, idx) => (
              <div key={idx} className="p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 text-center hover:border-emerald-500/30 transition-all">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="h-6 w-6 text-emerald-400" />
                </div>
                <h3 className="text-white font-semibold mb-2">{feature.title}</h3>
                <p className="text-white/50 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Why developers love Aexy
            </h2>
            <p className="text-white/50 text-lg">
              Built with developer experience as the top priority.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {benefits.map((benefit, idx) => (
              <div key={idx} className="group relative">
                <div className={`absolute inset-0 bg-gradient-to-br ${benefit.color} rounded-3xl opacity-0 group-hover:opacity-10 blur-xl transition-all duration-500`} />
                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all h-full">
                  <div className={`p-4 bg-gradient-to-br ${benefit.color} rounded-2xl w-fit mb-6`}>
                    <benefit.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{benefit.title}</h3>
                  <p className="text-white/60">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Terminal Preview */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-[#1a1a2e] rounded-2xl border border-white/10 overflow-hidden">
              {/* Terminal Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                <div className="flex gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                </div>
                <span className="text-white/40 text-sm ml-4">~ aexy profile</span>
              </div>
              {/* Terminal Content */}
              <div className="p-6 font-mono text-sm">
                <div className="text-emerald-400 mb-2">$ aexy profile --skills</div>
                <div className="text-white/60 mb-4">
                  <div className="mb-2">Analyzing 247 commits across 12 repositories...</div>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-4">
                    <span className="text-white w-24">TypeScript</span>
                    <div className="flex-1 h-2 bg-white/10 rounded-full">
                      <div className="h-full w-[92%] bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" />
                    </div>
                    <span className="text-emerald-400 w-12 text-right">92%</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-white w-24">React</span>
                    <div className="flex-1 h-2 bg-white/10 rounded-full">
                      <div className="h-full w-[87%] bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" />
                    </div>
                    <span className="text-cyan-400 w-12 text-right">87%</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-white w-24">Node.js</span>
                    <div className="flex-1 h-2 bg-white/10 rounded-full">
                      <div className="h-full w-[78%] bg-gradient-to-r from-green-500 to-emerald-500 rounded-full" />
                    </div>
                    <span className="text-green-400 w-12 text-right">78%</span>
                  </div>
                </div>
                <div className="text-white/40">
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="h-4 w-4" />
                    <span>Last contribution: 2 hours ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Open Source Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="flex items-start gap-4">
                <Github className="h-10 w-10 text-emerald-400 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    Open source, always
                  </h2>
                  <p className="text-white/60 mb-6">
                    Every algorithm, every metric, every line of code is open for you to inspect.
                    We believe developer tools should be transparent. Fork it, audit it, self-host it.
                    Your data, your rules.
                  </p>
                  <a
                    href="https://github.com/aexy-io/aexy"
                    className="inline-flex items-center gap-2 text-emerald-400 hover:gap-3 transition-all"
                  >
                    Star us on GitHub
                    <Star className="h-4 w-4 fill-current" />
                  </a>
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
            Join developers who get it
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Tools that respect your craft.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            >
              <Github className="h-5 w-5" />
              Sign in with GitHub
            </a>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              View Source Code
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

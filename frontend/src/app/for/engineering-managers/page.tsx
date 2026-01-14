"use client";

import Link from "next/link";
import {
  ArrowRight,
  Users,
  CheckCircle2,
  Target,
  Calendar,
  TrendingUp,
  Activity,
  Star,
  Github,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const painPoints = [
  { problem: "No visibility into what the team is actually working on", solution: "Real-time activity tracking synced with GitHub" },
  { problem: "Sprint planning based on gut feeling", solution: "AI-powered capacity planning based on historical data" },
  { problem: "Performance reviews feel subjective", solution: "SMART goals linked to actual code contributions" },
  { problem: "Skill gaps discovered too late", solution: "Continuous skill analysis and learning paths" },
];

const features = [
  {
    icon: Activity,
    title: "Team Visibility",
    description: "See what your team is working on without micromanaging. Real-time dashboards, not status meetings.",
    link: "/products/tracking",
  },
  {
    icon: Calendar,
    title: "Sprint Planning",
    description: "Plan sprints with real capacity data. AI suggests task assignments based on skills and workload.",
    link: "/products/planning",
  },
  {
    icon: Target,
    title: "Performance Reviews",
    description: "Run fair reviews backed by contribution data. SMART goals that auto-link to GitHub activity.",
    link: "/products/reviews",
  },
  {
    icon: TrendingUp,
    title: "Team Growth",
    description: "Identify skill gaps and create personalized learning paths. Track growth over time.",
    link: "/products/learning",
  },
];

export default function EngineeringManagersPage() {
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
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-full text-blue-400 text-sm mb-6">
            <Users className="h-4 w-4" />
            <span>For Engineering Managers</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            Lead your team with{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              clarity, not chaos
            </span>
          </h1>

          <p className="text-xl text-white/60 mb-10 max-w-3xl mx-auto leading-relaxed">
            Stop guessing what your team is working on. Get real-time visibility, data-driven planning,
            and fair performance reviews - all without micromanaging.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(59,130,246,0.3)]"
            >
              Start Free
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
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              No surveillance
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              Open source
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              Free tier available
            </span>
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Sound familiar?
            </h2>
          </div>

          <div className="space-y-4">
            {painPoints.map((item, idx) => (
              <div key={idx} className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 rounded-2xl" />
                <div className="relative grid md:grid-cols-2 gap-4 p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-red-400 text-xs">✕</span>
                    </div>
                    <p className="text-white/60">{item.problem}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400 flex-shrink-0" />
                    <p className="text-white">{item.solution}</p>
                  </div>
                </div>
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
              Everything you need to lead effectively
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, idx) => (
              <Link key={idx} href={feature.link} className="group">
                <div className="relative h-full">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500" />
                  <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-blue-500/30 transition-all h-full">
                    <div className="p-4 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl w-fit mb-6">
                      <feature.icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                    <p className="text-white/60 mb-4">{feature.description}</p>
                    <span className="text-blue-400 text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                      Learn more <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Quote */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10 text-center">
              <div className="flex justify-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                ))}
              </div>
              <blockquote className="text-xl md:text-2xl text-white/80 mb-6 italic">
                &ldquo;Sprint planning went from 2-hour meetings to 30 minutes.
                I finally have time to actually support my team.&rdquo;
              </blockquote>
              <div className="flex items-center justify-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-medium">
                  EZ
                </div>
                <div className="text-left">
                  <p className="text-white font-medium">Emily Zhang</p>
                  <p className="text-white/40 text-sm">VP Engineering, DataFlow</p>
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
            Ready to lead with clarity?
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Join thousands of engineering managers using Aexy.
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

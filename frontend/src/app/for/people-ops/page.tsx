"use client";

import Link from "next/link";
import {
  ArrowRight,
  Heart,
  CheckCircle2,
  GraduationCap,
  ClipboardCheck,
  TrendingUp,
  UserPlus,
  Clock,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const useCases = [
  {
    icon: UserPlus,
    title: "Technical Hiring",
    description: "Hire based on actual skills, not just resumes. AI-powered assessments that mirror real work.",
    link: "/products/hiring",
    color: "from-cyan-500 to-blue-500",
  },
  {
    icon: ClipboardCheck,
    title: "Performance Reviews",
    description: "Fair reviews backed by contribution data. 360° feedback with anonymous peer reviews.",
    link: "/products/reviews",
    color: "from-orange-500 to-amber-500",
  },
  {
    icon: GraduationCap,
    title: "Learning & Development",
    description: "Personalized learning paths based on skill gaps. Track growth and career progression.",
    link: "/products/learning",
    color: "from-rose-500 to-pink-500",
  },
  {
    icon: TrendingUp,
    title: "People Analytics",
    description: "Understand team health, engagement patterns, and predict attrition risks early.",
    link: "/products/tracking",
    color: "from-purple-500 to-violet-500",
  },
];

const benefits = [
  { title: "40% faster hiring", desc: "Skills-based matching reduces screening time" },
  { title: "Fair evaluations", desc: "Objective data eliminates bias in reviews" },
  { title: "Visible L&D impact", desc: "Track skill growth over time" },
  { title: "Early warning system", desc: "Predict burnout before it happens" },
];

export default function PeopleOpsPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-rose-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-pink-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-500/20 to-pink-500/20 border border-rose-500/30 rounded-full text-rose-400 text-sm mb-6">
            <Heart className="h-4 w-4" />
            <span>For HR & People Ops</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            People ops that{" "}
            <span className="bg-gradient-to-r from-rose-400 to-pink-400 bg-clip-text text-transparent">
              engineering trusts
            </span>
          </h1>

          <p className="text-xl text-white/60 mb-10 max-w-3xl mx-auto leading-relaxed">
            Hiring, reviews, and L&D that actually work for technical teams.
            Data-driven decisions that engineers respect because they&apos;re based on real contributions.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-rose-500 to-pink-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(244,63,94,0.3)]"
            >
              Start Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <Link
              href="/pricing"
              className="group inline-flex items-center justify-center gap-2 bg-white/5 text-white px-8 py-4 rounded-full text-lg font-medium border border-white/10 hover:border-white/20 transition-all"
            >
              View Pricing
            </Link>
          </div>

          <div className="flex items-center justify-center gap-8 text-sm text-white/40">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-rose-500" />
              Works with your ATS
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-rose-500" />
              GDPR compliant
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-rose-500" />
              Anonymous feedback
            </span>
          </div>
        </div>
      </section>

      {/* Benefits Strip */}
      <section className="py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-4 gap-4">
            {benefits.map((benefit, idx) => (
              <div key={idx} className="p-5 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 text-center">
                <div className="text-2xl font-bold text-white mb-1">{benefit.title}</div>
                <p className="text-white/50 text-sm">{benefit.desc}</p>
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
              Your complete people toolkit
            </h2>
            <p className="text-white/50 text-lg">
              Everything you need to hire, develop, and retain engineering talent.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {useCases.map((useCase, idx) => (
              <Link key={idx} href={useCase.link} className="group">
                <div className="relative h-full">
                  <div className={`absolute inset-0 bg-gradient-to-br ${useCase.color} rounded-3xl opacity-0 group-hover:opacity-20 blur-xl transition-all duration-500`} />
                  <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-rose-500/30 transition-all h-full">
                    <div className={`p-4 bg-gradient-to-br ${useCase.color} rounded-2xl w-fit mb-6`}>
                      <useCase.icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">{useCase.title}</h3>
                    <p className="text-white/60 mb-4">{useCase.description}</p>
                    <span className="text-rose-400 text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                      Learn more <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Review Cycle Preview */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Performance reviews that feel fair
              </h2>
              <p className="text-white/60 mb-6">
                No more subjective reviews that frustrate engineers. Every evaluation is backed
                by actual contribution data, peer feedback, and SMART goal progress.
              </p>
              <ul className="space-y-3">
                {[
                  "Auto-generated contribution summaries from GitHub",
                  "Anonymous 360° feedback using COIN framework",
                  "SMART goals that link to actual deliverables",
                  "AI-powered insights for balanced evaluations",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-white/70">
                    <CheckCircle2 className="h-5 w-5 text-rose-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-500/20 to-pink-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white font-medium">Review Cycle: Q4 2024</h3>
                  <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs rounded-full">In Progress</span>
                </div>
                <div className="space-y-4">
                  {[
                    { step: "Self-review", status: "complete", date: "Dec 15" },
                    { step: "Peer feedback", status: "complete", date: "Dec 20" },
                    { step: "Manager review", status: "current", date: "Dec 28" },
                    { step: "Calibration", status: "pending", date: "Jan 5" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${item.status === "complete" ? "bg-emerald-500/20" : item.status === "current" ? "bg-rose-500/20" : "bg-white/10"}`}>
                        {item.status === "complete" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : item.status === "current" ? (
                          <Clock className="h-4 w-4 text-rose-400" />
                        ) : (
                          <div className="w-2 h-2 bg-white/30 rounded-full" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm ${item.status === "pending" ? "text-white/40" : "text-white"}`}>{item.step}</p>
                      </div>
                      <span className="text-white/40 text-sm">{item.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integration Note */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 to-pink-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 border border-white/10 text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Works with tools you already use
              </h2>
              <p className="text-white/60 mb-8">
                Integrates with your existing ATS, HRIS, and communication tools.
                No need to rip and replace.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                {["Greenhouse", "Lever", "Workday", "BambooHR", "Slack", "Teams"].map((tool, idx) => (
                  <span key={idx} className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white/60 text-sm">
                    {tool}
                  </span>
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
            Ready to transform your people ops?
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Join HR teams who&apos;ve earned engineering&apos;s trust.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-rose-500 to-pink-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="mailto:sales@aexy.io"
              className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              Talk to Sales
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

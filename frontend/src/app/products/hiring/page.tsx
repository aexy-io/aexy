"use client";

import Link from "next/link";
import {
  ArrowRight,
  Users,
  CheckCircle2,
  FileText,
  Target,
  Clock,
  Sparkles,
  Bot,
  Code2,
  Award,
  BarChart3,
  UserPlus,
  ClipboardList,
  Zap,
  Shield,
  Github,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: FileText,
    title: "AI Job Description Generator",
    description: "Generate compelling job descriptions from your codebase. Match requirements to actual skills needed.",
    color: "from-cyan-500 to-blue-500",
  },
  {
    icon: Code2,
    title: "Technical Assessments",
    description: "Build custom assessments that mirror real work. Test actual skills, not trivia or algorithm puzzles.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: Target,
    title: "Skills-Based Matching",
    description: "Match candidates to roles based on demonstrated skills from their GitHub profiles.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: BarChart3,
    title: "Hiring Analytics",
    description: "Track pipeline metrics, time-to-hire, and candidate quality. Data-driven hiring decisions.",
    color: "from-amber-500 to-orange-500",
  },
];

const assessmentSteps = [
  { title: "Create Assessment", desc: "Build from templates or from scratch" },
  { title: "Invite Candidates", desc: "Send via email or shareable link" },
  { title: "Auto-Score", desc: "AI evaluates technical responses" },
  { title: "Review & Hire", desc: "Compare candidates objectively" },
];

export default function HiringProductPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-full text-cyan-400 text-sm mb-6">
                <Users className="h-4 w-4" />
                <span>Technical Hiring</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Hire engineers based on{" "}
                <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  real skills
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                AI-powered job descriptions, technical assessments that mirror real work,
                and skills-based matching. Hire the right people faster.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(6,182,212,0.3)]"
                >
                  Start Hiring Free
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
                  <CheckCircle2 className="h-4 w-4 text-cyan-500" />
                  AI-generated JDs
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-cyan-500" />
                  Technical assessments
                </span>
              </div>
            </div>

            {/* Visual - Assessment Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-white font-medium">Senior Backend Engineer</p>
                    <p className="text-white/40 text-sm">Technical Assessment</p>
                  </div>
                  <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">12 candidates</span>
                </div>

                {/* Assessment Topics */}
                <div className="space-y-3 mb-6">
                  {[
                    { name: "System Design", questions: 3, weight: "30%" },
                    { name: "API Development", questions: 4, weight: "35%" },
                    { name: "Database & SQL", questions: 3, weight: "25%" },
                    { name: "Problem Solving", questions: 2, weight: "10%" },
                  ].map((topic, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-cyan-500 rounded-full" />
                        <span className="text-white text-sm">{topic.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-white/40 text-sm">
                        <span>{topic.questions} questions</span>
                        <span className="text-cyan-400">{topic.weight}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI Badge */}
                <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20 flex items-center gap-3">
                  <Bot className="h-5 w-5 text-cyan-400" />
                  <span className="text-white/70 text-sm">AI auto-scores technical responses</span>
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
              Hiring tools that work
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              From job posting to offer letter, everything you need to hire great engineers.
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

      {/* Assessment Flow */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Assessment workflow
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {assessmentSteps.map((step, idx) => (
              <div key={idx} className="relative">
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center h-full">
                  <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center mx-auto mb-4 text-white font-bold">
                    {idx + 1}
                  </div>
                  <h3 className="text-white font-semibold mb-2">{step.title}</h3>
                  <p className="text-white/50 text-sm">{step.desc}</p>
                </div>
                {idx < assessmentSteps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 text-white/20">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* JD Generator */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/20 rounded-full text-cyan-400 text-xs mb-4">
                    <Sparkles className="h-3 w-3" />
                    AI-POWERED
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    Generate JDs from code
                  </h2>
                  <p className="text-white/60 mb-6">
                    Our AI analyzes your codebase to understand the real skills needed.
                    Generate job descriptions that attract candidates who can actually do the work.
                  </p>
                  <ul className="space-y-3">
                    {[
                      "Analyze tech stack automatically",
                      "Match skills to actual requirements",
                      "Generate compelling descriptions",
                      "Reduce time-to-post by 80%",
                    ].map((item, idx) => (
                      <li key={idx} className="flex items-center gap-3 text-white/70">
                        <CheckCircle2 className="h-5 w-5 text-cyan-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <Sparkles className="h-5 w-5 text-cyan-400" />
                    <span className="text-white font-medium">Generated JD Preview</span>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="p-3 bg-white/5 rounded-lg">
                      <p className="text-white/80">
                        <span className="text-cyan-400 font-medium">Role:</span> Senior Backend Engineer
                      </p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg">
                      <p className="text-white/60 text-xs mb-2">Required Skills (from codebase):</p>
                      <div className="flex flex-wrap gap-2">
                        {["Node.js", "TypeScript", "PostgreSQL", "Redis", "Docker"].map((s, i) => (
                          <span key={i} className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-xs">{s}</span>
                        ))}
                      </div>
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
            Hire better engineers faster
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Skills-based hiring that works.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
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

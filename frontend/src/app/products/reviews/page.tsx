"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  CheckCircle2,
  Users,
  Target,
  TrendingUp,
  MessageSquare,
  Calendar,
  Sparkles,
  Bot,
  Star,
  Award,
  BarChart3,
  Shield,
  Eye,
  Github,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Target,
    title: "SMART Goals",
    description: "Set objectives that automatically link to GitHub contributions. Track progress with real data, not guesswork.",
    color: "from-orange-500 to-amber-500",
  },
  {
    icon: Users,
    title: "360° Feedback",
    description: "Anonymous peer reviews using the COIN framework. Get balanced feedback from managers, peers, and direct reports.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Bot,
    title: "AI-Generated Summaries",
    description: "LLM-powered insights that synthesize GitHub activity into compelling review narratives.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: TrendingUp,
    title: "Growth Tracking",
    description: "Monitor skill development over time. Connect learning paths to performance goals.",
    color: "from-emerald-500 to-teal-500",
  },
];

export default function ReviewsProductPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 rounded-full text-orange-400 text-sm mb-6">
                <ClipboardCheck className="h-4 w-4" />
                <span>Performance Reviews</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Reviews that{" "}
                <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
                  feel fair
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                Performance reviews backed by real contribution data.
                SMART goals linked to GitHub. 360° feedback with anonymity.
                AI-generated summaries that capture the full picture.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(249,115,22,0.3)]"
                >
                  Start Reviews Free
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
                  <CheckCircle2 className="h-4 w-4 text-orange-500" />
                  GitHub-linked goals
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-orange-500" />
                  Anonymous feedback
                </span>
              </div>
            </div>

            {/* Visual - Review Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-amber-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full flex items-center justify-center text-white font-medium">
                      SK
                    </div>
                    <div>
                      <p className="text-white font-medium">Sarah Kim</p>
                      <p className="text-white/40 text-sm">Q4 2024 Review</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">Exceeds</span>
                </div>

                {/* Goals Progress */}
                <div className="space-y-4 mb-6">
                  <div className="text-white/40 text-xs font-semibold tracking-wider">GOAL PROGRESS</div>
                  {[
                    { name: "Complete API refactoring", progress: 100, linked: true },
                    { name: "Mentor 2 junior developers", progress: 75, linked: false },
                    { name: "Reduce build time by 20%", progress: 90, linked: true },
                  ].map((goal, idx) => (
                    <div key={idx} className="p-3 bg-white/5 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white text-sm">{goal.name}</span>
                        {goal.linked && (
                          <span className="text-xs text-orange-400 flex items-center gap-1">
                            <Github className="h-3 w-3" /> Linked
                          </span>
                        )}
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full"
                          style={{ width: `${goal.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI Summary */}
                <div className="p-4 bg-orange-500/10 rounded-xl border border-orange-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-orange-400" />
                    <span className="text-orange-400 text-xs font-medium">AI Summary</span>
                  </div>
                  <p className="text-white/70 text-sm">
                    &ldquo;Led 3 major feature implementations with 98% test coverage. Strong collaboration with cross-functional teams...&rdquo;
                  </p>
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
              Performance reviews that actually work
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Move beyond subjective opinions to data-driven performance management.
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

      {/* COIN Framework */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              COIN Feedback Framework
            </h2>
            <p className="text-white/50">Structured feedback that drives growth.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { letter: "C", word: "Context", desc: "What was the situation?", color: "from-blue-500 to-cyan-500" },
              { letter: "O", word: "Observation", desc: "What did you observe?", color: "from-purple-500 to-violet-500" },
              { letter: "I", word: "Impact", desc: "What was the impact?", color: "from-orange-500 to-amber-500" },
              { letter: "N", word: "Next", desc: "What should happen next?", color: "from-emerald-500 to-teal-500" },
            ].map((item, idx) => (
              <div key={idx} className="relative group">
                <div className={`absolute inset-0 bg-gradient-to-br ${item.color} rounded-2xl opacity-0 group-hover:opacity-20 blur-xl transition-all`} />
                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center hover:border-white/20 transition-all h-full">
                  <div className={`w-12 h-12 bg-gradient-to-br ${item.color} rounded-xl flex items-center justify-center mx-auto mb-3 text-white text-xl font-bold`}>
                    {item.letter}
                  </div>
                  <h3 className="text-white font-semibold mb-1">{item.word}</h3>
                  <p className="text-white/40 text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-amber-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 border border-white/10">
              <div className="flex items-start gap-4">
                <Shield className="h-8 w-8 text-orange-400 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl font-bold text-white mb-4">
                    Anonymous and secure
                  </h2>
                  <p className="text-white/60 mb-6">
                    Peer feedback is always anonymous. Reviewers can speak honestly without fear.
                    All data is encrypted and you control who sees what.
                  </p>
                  <div className="grid md:grid-cols-3 gap-4">
                    {[
                      { icon: Eye, label: "Anonymous by default" },
                      { icon: Shield, label: "End-to-end encryption" },
                      { icon: Users, label: "Role-based access" },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-white/70">
                        <item.icon className="h-5 w-5 text-orange-400" />
                        <span className="text-sm">{item.label}</span>
                      </div>
                    ))}
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
            Make performance reviews fair
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Data-driven reviews that developers and managers both trust.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
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

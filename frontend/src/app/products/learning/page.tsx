"use client";

import Link from "next/link";
import {
  ArrowRight,
  GraduationCap,
  CheckCircle2,
  TrendingUp,
  Target,
  Award,
  BookOpen,
  Sparkles,
  Users,
  BarChart3,
  Star,
  Rocket,
  Code2,
  Trophy,
  Zap,
  Github,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Target,
    title: "Skill Gap Analysis",
    description: "AI identifies skill gaps by comparing your team's capabilities with project requirements and industry standards.",
    color: "from-rose-500 to-pink-500",
  },
  {
    icon: BookOpen,
    title: "Personalized Learning Paths",
    description: "Curated learning resources tailored to each developer's current skills and growth goals.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: Trophy,
    title: "Gamified Progress",
    description: "Achievement badges, skill levels, and leaderboards that make learning engaging and visible.",
    color: "from-amber-500 to-orange-500",
  },
  {
    icon: TrendingUp,
    title: "Career Growth Tracking",
    description: "Visualize skill development over time. Connect learning to promotions and career milestones.",
    color: "from-emerald-500 to-teal-500",
  },
];

const skills = [
  { name: "TypeScript", level: 85, color: "from-blue-500 to-cyan-500" },
  { name: "React", level: 78, color: "from-cyan-500 to-teal-500" },
  { name: "Node.js", level: 72, color: "from-green-500 to-emerald-500" },
  { name: "Python", level: 45, color: "from-yellow-500 to-amber-500", gap: true },
  { name: "Kubernetes", level: 30, color: "from-purple-500 to-violet-500", gap: true },
];

export default function LearningProductPage() {
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
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-500/20 to-pink-500/20 border border-rose-500/30 rounded-full text-rose-400 text-sm mb-6">
                <GraduationCap className="h-4 w-4" />
                <span>Learning & Development</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Grow your team&apos;s{" "}
                <span className="bg-gradient-to-r from-rose-400 to-pink-400 bg-clip-text text-transparent">
                  skills
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                AI-powered skill gap analysis and personalized learning paths.
                Track growth, celebrate achievements, and build a culture of continuous learning.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-rose-500 to-pink-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(244,63,94,0.3)]"
                >
                  Start Learning Free
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
                  <CheckCircle2 className="h-4 w-4 text-rose-500" />
                  AI skill analysis
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-rose-500" />
                  Gamified progress
                </span>
              </div>
            </div>

            {/* Visual - Skills Dashboard */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-500/20 to-pink-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-pink-500 rounded-full flex items-center justify-center text-white font-medium">
                      JD
                    </div>
                    <div>
                      <p className="text-white font-medium">Jane Developer</p>
                      <p className="text-white/40 text-sm">Level 12 · Senior Engineer</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-400" />
                    <span className="text-amber-400 font-medium">2,450 XP</span>
                  </div>
                </div>

                {/* Skills */}
                <div className="space-y-4 mb-6">
                  <div className="text-white/40 text-xs font-semibold tracking-wider">SKILL PROGRESS</div>
                  {skills.map((skill, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white text-sm">{skill.name}</span>
                        <div className="flex items-center gap-2">
                          {skill.gap && (
                            <span className="text-xs text-rose-400 px-2 py-0.5 bg-rose-500/20 rounded">Gap</span>
                          )}
                          <span className="text-white/40 text-sm">{skill.level}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${skill.color} rounded-full transition-all`}
                          style={{ width: `${skill.level}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Achievements */}
                <div className="flex items-center gap-3">
                  <div className="text-white/40 text-xs">Recent:</div>
                  {[
                    { icon: Code2, color: "from-blue-500 to-cyan-500" },
                    { icon: Star, color: "from-amber-500 to-orange-500" },
                    { icon: Rocket, color: "from-purple-500 to-violet-500" },
                  ].map((badge, idx) => (
                    <div key={idx} className={`w-8 h-8 bg-gradient-to-br ${badge.color} rounded-lg flex items-center justify-center`}>
                      <badge.icon className="h-4 w-4 text-white" />
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
              Learning that actually sticks
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Move beyond random tutorials to structured, personalized growth.
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

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              How learning paths work
            </h2>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 to-pink-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-8 md:p-12 border border-white/10">
              <div className="grid md:grid-cols-4 gap-6">
                {[
                  { step: "1", title: "Analyze Skills", desc: "AI scans your code contributions to identify strengths and gaps", icon: Sparkles },
                  { step: "2", title: "Set Goals", desc: "Choose what you want to learn based on career aspirations", icon: Target },
                  { step: "3", title: "Learn & Practice", desc: "Follow curated resources and apply skills in real projects", icon: BookOpen },
                  { step: "4", title: "Level Up", desc: "Earn badges, track progress, and celebrate achievements", icon: Trophy },
                ].map((item, idx) => (
                  <div key={idx} className="text-center">
                    <div className="relative w-14 h-14 mx-auto mb-4">
                      <div className="absolute inset-0 bg-gradient-to-br from-rose-500 to-pink-500 rounded-2xl" />
                      <div className="absolute inset-0 flex items-center justify-center text-white">
                        <item.icon className="h-6 w-6" />
                      </div>
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-white text-black rounded-full flex items-center justify-center text-xs font-bold">
                        {item.step}
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                    <p className="text-white/50 text-sm">{item.desc}</p>
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
            Start growing your team today
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Personalized learning paths for every developer.
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

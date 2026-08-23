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
import { LedgerPage } from "@/components/landing/LedgerPage";


const features = [
  {
    icon: Target,
    title: "Skill Gap Analysis",
    description: "AI identifies skill gaps by comparing your team's capabilities with project requirements and industry standards.",
  },
  {
    icon: BookOpen,
    title: "Personalized Learning Paths",
    description: "Curated learning resources tailored to each developer's current skills and growth goals.",
  },
  {
    icon: Trophy,
    title: "Gamified Progress",
    description: "Achievement badges, skill levels, and leaderboards that make learning engaging and visible.",
  },
  {
    icon: TrendingUp,
    title: "Career Growth Tracking",
    description: "Visualize skill development over time. Connect learning to promotions and career milestones.",
  },
];

const skills = [
  { name: "TypeScript", level: 85 },
  { name: "React", level: 78 },
  { name: "Node.js", level: 72 },
  { name: "Python", level: 45, gap: true },
  { name: "Kubernetes", level: 30, gap: true },
];

export default function LearningProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <GraduationCap className="h-4 w-4" />
                <span>Learning & Development</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Grow your team&apos;s{" "}
                <span className="text-ledger-green">skills</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                AI-powered skill gap analysis and personalized learning paths.
                Track growth, celebrate achievements, and build a culture of continuous learning.
              </p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  Start Learning Free
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/pricing"
                  className="group inline-flex items-center justify-center gap-2 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-medium text-ledger-ink transition hover:border-ledger-ink/50"
                >
                  See pricing
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-ledger-ink/55">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  AI skill analysis
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Gamified progress
                </span>
              </div>
            </div>

            {/* Visual - Skills Dashboard.

                DARK PANE: a genuine product mockup — the developer's skill
                dashboard as the app renders it — so it keeps the plate treatment
                used for product UI on the paper page (see OsConsolePreview):
                ledger-pane ground, white-opacity type, ledger-mint as the only
                accent. The white/* utilities below are scoped to this pane. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7] shadow-[0_1px_0_rgba(16,25,19,0.08)]">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[2px] border border-white/12 font-brand-mono text-[11px] text-white/70">
                    JD
                  </div>
                  <div>
                    <p className="font-display font-medium">Jane Developer</p>
                    <p className="font-brand-mono text-[11px] text-white/50">Level 12 · Senior Engineer</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-ledger-mint" />
                  <span className="font-brand-mono text-[13px] text-ledger-mint">2,450 XP</span>
                </div>
              </div>

              {/* Skills */}
              <div className="mb-6 space-y-4">
                <div className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/50">SKILL PROGRESS</div>
                {skills.map((skill, idx) => (
                  <div key={idx}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[13px] text-white/85">{skill.name}</span>
                      <div className="flex items-center gap-2">
                        {skill.gap && (
                          <span className="rounded-[2px] border border-white/20 px-2 py-0.5 font-brand-mono text-[10px] uppercase tracking-[0.14em] text-white/60">Gap</span>
                        )}
                        <span className="font-brand-mono text-[11px] text-white/50">{skill.level}%</span>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-[2px] bg-white/10">
                      <div
                        className="h-full rounded-[2px] bg-ledger-mint transition-all"
                        style={{ width: `${skill.level}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Achievements */}
              <div className="flex items-center gap-3">
                <div className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Recent:</div>
                {[
                  { icon: Code2 },
                  { icon: Star },
                  { icon: Rocket },
                ].map((badge, idx) => (
                  <div key={idx} className="flex h-8 w-8 items-center justify-center rounded-[2px] border border-white/12">
                    <badge.icon className="h-4 w-4 text-ledger-mint" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Learning that actually sticks
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              Move beyond random tutorials to structured, personalized growth.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <feature.icon className="mb-6 h-5 w-5 text-ledger-green" />
                <h3 className="mb-3 font-display text-xl font-semibold">{feature.title}</h3>
                <p className="text-ledger-ink/65">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              How learning paths work
            </h2>
          </div>

          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 md:p-12">
            <div className="grid gap-6 md:grid-cols-4">
              {[
                { step: "1", title: "Analyze Skills", desc: "AI scans your code contributions to identify strengths and gaps", icon: Sparkles },
                { step: "2", title: "Set Goals", desc: "Choose what you want to learn based on career aspirations", icon: Target },
                { step: "3", title: "Learn & Practice", desc: "Follow curated resources and apply skills in real projects", icon: BookOpen },
                { step: "4", title: "Level Up", desc: "Earn badges, track progress, and celebrate achievements", icon: Trophy },
              ].map((item, idx) => (
                <div key={idx} className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[2px] border border-ledger-ink/15 bg-ledger-paper">
                    <item.icon className="h-6 w-6 text-ledger-green" />
                  </div>
                  <div className="mb-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-ink/50">
                    {item.step}
                  </div>
                  <h3 className="mb-2 font-display text-lg font-semibold">{item.title}</h3>
                  <p className="text-sm text-ledger-ink/60">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Start growing your team today
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            Personalized learning paths for every developer.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
            >
              <Github className="h-5 w-5" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

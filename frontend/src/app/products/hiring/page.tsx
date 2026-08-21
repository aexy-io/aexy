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
import { LedgerPage } from "@/components/landing/LedgerPage";


const features = [
  {
    icon: FileText,
    title: "AI Job Description Generator",
    description: "Generate compelling job descriptions from your codebase. Match requirements to actual skills needed.",
  },
  {
    icon: Code2,
    title: "Technical Assessments",
    description: "Build custom assessments that mirror real work. Test actual skills, not trivia or algorithm puzzles.",
  },
  {
    icon: Target,
    title: "Skills-Based Matching",
    description: "Match candidates to roles based on demonstrated skills from their GitHub profiles.",
  },
  {
    icon: BarChart3,
    title: "Hiring Analytics",
    description: "Track pipeline metrics, time-to-hire, and candidate quality. Data-driven hiring decisions.",
  },
];

const assessmentSteps = [
  { title: "Create Assessment", desc: "Build from templates or from scratch" },
  { title: "Invite Candidates", desc: "Send via email or shareable link" },
  { title: "Auto-Score", desc: "AI evaluates technical responses" },
  { title: "Review & Hire", desc: "Compare candidates objectively" },
];

export default function HiringProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Users className="h-4 w-4" />
                <span>Technical Hiring</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Hire engineers based on{" "}
                <span className="text-ledger-green">real skills</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                AI-powered job descriptions, technical assessments that mirror real work,
                and skills-based matching. Hire the right people faster.
              </p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  Start Hiring Free
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
                  AI-generated JDs
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Technical assessments
                </span>
              </div>
            </div>

            {/* Visual - Assessment Preview.

                DARK PANE: a genuine product mockup — the assessment builder as
                the app renders it — so it keeps the plate treatment used for
                product UI on the paper page (see OsConsolePreview): ledger-pane
                ground, white-opacity type, ledger-mint as the only accent. The
                white/* utilities below are scoped to this pane on purpose. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7] shadow-[0_1px_0_rgba(16,25,19,0.08)]">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="font-display font-medium">Senior Backend Engineer</p>
                  <p className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Technical Assessment</p>
                </div>
                <span className="rounded-[2px] border border-white/12 px-3 py-1 font-brand-mono text-[10px] uppercase tracking-[0.14em] text-ledger-mint">12 candidates</span>
              </div>

              {/* Assessment Topics */}
              <div className="mb-6 space-y-3">
                {[
                  { name: "System Design", questions: 3, weight: "30%" },
                  { name: "API Development", questions: 4, weight: "35%" },
                  { name: "Database & SQL", questions: 3, weight: "25%" },
                  { name: "Problem Solving", questions: 2, weight: "10%" },
                ].map((topic, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-[2px] border border-white/12 p-3">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-ledger-mint" />
                      <span className="text-[13px] text-white/85">{topic.name}</span>
                    </div>
                    <div className="flex items-center gap-4 font-brand-mono text-[11px] text-white/50">
                      <span>{topic.questions} questions</span>
                      <span className="text-ledger-mint">{topic.weight}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Badge */}
              <div className="flex items-center gap-3 rounded-[2px] border-l-2 border-ledger-mint bg-white/[0.03] px-3.5 py-3">
                <Bot className="h-5 w-5 shrink-0 text-ledger-mint" />
                <span className="text-[13px] text-white/85">AI auto-scores technical responses</span>
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
              Hiring tools that work
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              From job posting to offer letter, everything you need to hire great engineers.
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

      {/* Assessment Flow */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Assessment workflow
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {assessmentSteps.map((step, idx) => (
              <div key={idx} className="relative">
                <div className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 text-center">
                  <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-[2px] border border-ledger-ink/20 bg-ledger-paper font-brand-mono text-sm font-medium text-ledger-green">
                    {idx + 1}
                  </div>
                  <h3 className="mb-2 font-display font-semibold">{step.title}</h3>
                  <p className="text-sm text-ledger-ink/60">{step.desc}</p>
                </div>
                {idx < assessmentSteps.length - 1 && (
                  <div className="absolute top-1/2 -right-2 hidden -translate-y-1/2 transform text-ledger-ink/25 md:block">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* JD Generator */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                  <Sparkles className="h-3 w-3" />
                  AI-POWERED
                </div>
                <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Generate JDs from code
                </h2>
                <p className="mb-6 text-ledger-ink/65">
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
                    <li key={idx} className="flex items-start gap-3 text-ledger-ink/75">
                      <span className="font-brand-mono leading-6 text-ledger-green">+</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* DARK PANE: the generated job description as the app renders it
                  — a genuine product mockup, white/* utilities intentional. */}
              <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
                <div className="mb-4 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-ledger-mint" />
                  <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Generated JD Preview</span>
                </div>
                <div className="space-y-3">
                  <div className="rounded-[2px] border border-white/12 p-3">
                    <p className="text-[13px] text-white/85">
                      <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">Role:</span> Senior Backend Engineer
                    </p>
                  </div>
                  <div className="rounded-[2px] border border-white/12 p-3">
                    <p className="mb-2 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Required Skills (from codebase):</p>
                    <div className="flex flex-wrap gap-2">
                      {["Node.js", "TypeScript", "PostgreSQL", "Redis", "Docker"].map((s, i) => (
                        <span key={i} className="rounded-[2px] border border-white/12 px-2 py-1 font-brand-mono text-[11px] text-ledger-mint">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Hire better engineers faster
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            Skills-based hiring that works.
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

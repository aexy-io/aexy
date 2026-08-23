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
import { LedgerPage } from "@/components/landing/LedgerPage";

// "Open Ledger" light brand: paper page, ink text, ledger-green accents. The
// review-cycle mockup is the only dark pane — the product shown as a plate.


const useCases = [
  {
    icon: UserPlus,
    title: "Technical Hiring",
    description: "Hire based on actual skills, not just resumes. AI-powered assessments that mirror real work.",
    link: "/products/hiring",
  },
  {
    icon: ClipboardCheck,
    title: "Performance Reviews",
    description: "Fair reviews backed by contribution data. 360° feedback with anonymous peer reviews.",
    link: "/products/reviews",
  },
  {
    icon: GraduationCap,
    title: "Learning & Development",
    description: "Personalized learning paths based on skill gaps. Track growth and career progression.",
    link: "/products/learning",
  },
  {
    icon: TrendingUp,
    title: "People Analytics",
    description: "Understand team health, engagement patterns, and predict attrition risks early.",
    link: "/products/tracking",
  },
];

const benefits = [
  { title: "Faster screening", desc: "Skills-based matching ranks candidates against real contribution data" },
  { title: "Fair evaluations", desc: "Objective data eliminates bias in reviews" },
  { title: "Visible L&D impact", desc: "Track skill growth over time" },
  { title: "Early warning system", desc: "Predict burnout before it happens" },
];

export default function PeopleOpsPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-5xl mx-auto text-center">
          <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            <Heart className="h-4 w-4" />
            <span>For HR & People Ops</span>
          </div>

          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold text-ledger-ink mb-6 tracking-tight leading-tight">
            People ops that <span className="text-ledger-green">engineering trusts</span>
          </h1>

          <p className="text-xl text-ledger-ink/65 mb-10 max-w-3xl mx-auto leading-relaxed">
            Hiring, reviews, and L&D that actually work for technical teams.
            Data-driven decisions that engineers respect because they&apos;re based on real contributions.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green text-ledger-paper px-8 py-4 text-lg font-semibold transition hover:bg-[#095A31]"
            >
              Start Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/pricing"
              className="group inline-flex items-center justify-center gap-2 rounded-[2px] border border-ledger-ink/25 text-ledger-ink px-8 py-4 text-lg font-medium transition hover:border-ledger-ink/50"
            >
              View Pricing
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-ledger-ink/55">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ledger-green" />
              Works with your ATS
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ledger-green" />
              GDPR compliant
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ledger-green" />
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
              <div key={idx} className="p-5 rounded-[2px] border border-ledger-ink/12 bg-ledger-card text-center">
                <div className="font-display text-2xl font-semibold text-ledger-ink mb-1">{benefit.title}</div>
                <p className="text-ledger-ink/60 text-sm leading-6">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-ledger-ink mb-4 tracking-tight">
              Your complete people toolkit
            </h2>
            <p className="text-ledger-ink/60 text-lg">
              Everything you need to hire, develop, and retain engineering talent.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {useCases.map((useCase, idx) => (
              <Link key={idx} href={useCase.link} className="group">
                <div className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
                  <useCase.icon className="mb-6 h-5 w-5 text-ledger-green" />
                  <h3 className="font-display text-xl font-semibold text-ledger-ink mb-3">{useCase.title}</h3>
                  <p className="text-ledger-ink/65 leading-7 mb-4">{useCase.description}</p>
                  <span className="text-ledger-green text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                    Learn more <ArrowRight className="h-4 w-4" />
                  </span>
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
              <h2 className="font-display text-2xl md:text-3xl font-semibold text-ledger-ink mb-4 tracking-tight">
                Performance reviews that feel fair
              </h2>
              <p className="text-ledger-ink/65 mb-6 leading-7">
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
                  <li key={idx} className="flex items-start gap-3 text-ledger-ink/75 leading-7">
                    <span className="font-brand-mono leading-7 text-ledger-green">+</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* A genuine product mockup, so it stays a dark pane — the white/*
                utilities below are scoped to this pane on purpose. */}
            <div className="overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane text-[#E6EDE7] p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-white/90 font-medium">Review Cycle: Q4 2024</h3>
                <span className="px-3 py-1 rounded-[2px] border border-ledger-mint/40 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">In Progress</span>
              </div>
              <div className="space-y-4">
                {[
                  { step: "Self-review", status: "complete", date: "Dec 15" },
                  { step: "Peer feedback", status: "complete", date: "Dec 20" },
                  { step: "Manager review", status: "current", date: "Dec 28" },
                  { step: "Calibration", status: "pending", date: "Jan 5" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 rounded-[2px] border border-white/12">
                    <div className="w-8 h-8 rounded-[2px] flex items-center justify-center bg-white/[0.06]">
                      {item.status === "complete" ? (
                        <CheckCircle2 className="h-4 w-4 text-ledger-mint" />
                      ) : item.status === "current" ? (
                        <Clock className="h-4 w-4 text-ledger-mint" />
                      ) : (
                        <div className="w-2 h-2 bg-white/30 rounded-full" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm ${item.status === "pending" ? "text-white/50" : "text-white/90"}`}>{item.step}</p>
                    </div>
                    <span className="font-brand-mono text-white/50 text-xs">{item.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integration Note */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 text-center">
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-ledger-ink mb-4 tracking-tight">
              Works with tools you already use
            </h2>
            <p className="text-ledger-ink/65 mb-8 leading-7">
              Integrates with your existing ATS, HRIS, and communication tools.
              No need to rip and replace.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {["Greenhouse", "Lever", "Workday", "BambooHR", "Slack", "Teams"].map((tool, idx) => (
                <span
                  key={idx}
                  className="px-4 py-2 rounded-[2px] border border-ledger-ink/12 bg-ledger-paper font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/60"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-ledger-ink mb-4 tracking-tight">
            Ready to transform your people ops?
          </h2>
          <p className="text-xl text-ledger-ink/60 mb-10">
            Join HR teams who&apos;ve earned engineering&apos;s trust.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green text-ledger-paper px-8 py-4 text-lg font-semibold transition hover:bg-[#095A31]"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="mailto:sales@aexy.io"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 text-ledger-ink px-8 py-4 text-lg font-semibold transition hover:border-ledger-ink/50"
            >
              Talk to Sales
            </a>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

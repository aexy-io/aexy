"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  CheckCircle2,
  Users,
  Target,
  TrendingUp,
  Sparkles,
  Bot,
  Shield,
  Eye,
  Github,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { ProductShot } from "@/components/marketing/ProductShot";
import reviewsShot from "../../../../public/marketing/home/home-grow@2x.webp";


const features = [
  {
    icon: Target,
    title: "SMART Goals",
    description: "Set objectives that automatically link to GitHub contributions. Track progress with real data, not guesswork.",
  },
  {
    icon: Users,
    title: "360° Feedback",
    description: "Anonymous peer reviews using the COIN framework. Get balanced feedback from managers, peers, and direct reports.",
  },
  {
    icon: Bot,
    title: "AI-Generated Summaries",
    description: "LLM-powered insights that synthesize GitHub activity into compelling review narratives.",
  },
  {
    icon: TrendingUp,
    title: "Growth Tracking",
    description: "Monitor skill development over time. Connect learning paths to performance goals.",
  },
];

export default function ReviewsProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <ClipboardCheck className="h-4 w-4" />
                <span>Performance Reviews</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Reviews that{" "}
                <span className="text-ledger-green">feel fair</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                Performance reviews backed by real contribution data.
                SMART goals linked to GitHub. 360° feedback with anonymity.
                AI-generated summaries that capture the full picture.
              </p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  Start Reviews Free
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
                  GitHub-linked goals
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Anonymous feedback
                </span>
              </div>
            </div>

            {/* Visual - Review Preview.

                DARK PANE: a genuine product mockup — a review record as the app
                renders it — so it keeps the plate treatment used for product UI
                on the paper page (see OsConsolePreview): ledger-pane ground,
                white-opacity type, ledger-mint as the only accent. The white/*
                utilities below are intentional inside bg-ledger-pane. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[2px] border border-white/12 font-brand-mono text-xs text-white/70">
                    SK
                  </div>
                  <div>
                    <p className="font-medium text-white/90">Sarah Kim</p>
                    <p className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Q4 2024 Review</p>
                  </div>
                </div>
                <span className="rounded-[2px] bg-ledger-mint/15 px-3 py-1 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">
                  Exceeds
                </span>
              </div>

              {/* Goals Progress */}
              <div className="mb-6 space-y-4">
                <div className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/50">GOAL PROGRESS</div>
                {[
                  { name: "Complete API refactoring", progress: 100, linked: true },
                  { name: "Mentor 2 junior developers", progress: 75, linked: false },
                  { name: "Reduce build time by 20%", progress: 90, linked: true },
                ].map((goal, idx) => (
                  <div key={idx} className="rounded-[2px] border border-white/12 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[13px] text-white/85">{goal.name}</span>
                      {goal.linked && (
                        <span className="flex items-center gap-1 font-brand-mono text-[10px] uppercase tracking-[0.14em] text-ledger-mint">
                          <Github className="h-3 w-3" /> Linked
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-[2px] bg-white/10">
                      <div
                        className="h-full bg-ledger-mint"
                        style={{ width: `${goal.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Summary */}
              <div className="border-l-2 border-ledger-mint bg-white/[0.03] px-3.5 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-ledger-mint" />
                  <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">AI Summary</span>
                </div>
                <p className="text-sm leading-6 text-white/75">
                  &ldquo;Led 3 major feature implementations with 98% test coverage. Strong collaboration with cross-functional teams...&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Real screenshot. The hero above is a hand-built mockup sized for a
          two-column layout; this is the surface as the app actually renders it,
          captured by e2e/tools/capture-marketing-shots.ts. */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-2xl">
            <div className="mb-4 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
              In the product
            </div>
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              A review cycle you can see the state of.
            </h2>
            <p className="text-lg leading-relaxed text-ledger-ink/65">
              Who has submitted, who hasn&apos;t, and what the cycle is actually measuring — visible without chasing anyone.
            </p>
          </div>
          <ProductShot
            src={reviewsShot}
            alt="Aexy performance reviews showing an active quarterly review cycle and its submission state"
            figure="FIG. 01"
            caption="Review cycle — quarterly engineering reviews"
          />
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Performance reviews that actually work
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              Move beyond subjective opinions to data-driven performance management.
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

      {/* COIN Framework */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              COIN Feedback Framework
            </h2>
            <p className="text-ledger-ink/55">Structured feedback that drives growth.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {[
              { letter: "C", word: "Context", desc: "What was the situation?" },
              { letter: "O", word: "Observation", desc: "What did you observe?" },
              { letter: "I", word: "Impact", desc: "What was the impact?" },
              { letter: "N", word: "Next", desc: "What should happen next?" },
            ].map((item, idx) => (
              <div
                key={idx}
                className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 text-center transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[2px] border border-ledger-ink/25 bg-ledger-paper font-brand-mono text-xl text-ledger-green">
                  {item.letter}
                </div>
                <h3 className="mb-1 font-display text-base font-semibold">{item.word}</h3>
                <p className="text-sm leading-6 text-ledger-ink/55">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10">
            <div className="flex items-start gap-4">
              <Shield className="h-5 w-5 flex-shrink-0 text-ledger-green" />
              <div>
                <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">
                  Anonymous and secure
                </h2>
                <p className="mb-6 text-ledger-ink/65">
                  Peer feedback is always anonymous. Reviewers can speak honestly without fear.
                  All data is encrypted and you control who sees what.
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    { icon: Eye, label: "Anonymous by default" },
                    { icon: Shield, label: "End-to-end encryption" },
                    { icon: Users, label: "Role-based access" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-ledger-ink/75">
                      <item.icon className="h-5 w-5 text-ledger-green" />
                      <span className="text-sm">{item.label}</span>
                    </div>
                  ))}
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
            Make performance reviews fair
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            Data-driven reviews that developers and managers both trust.
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

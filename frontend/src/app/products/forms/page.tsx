"use client";

import Link from "next/link";
import {
  ArrowRight,
  FormInput,
  CheckCircle2,
  Zap,
  Layout,
  Workflow,
  FileText,
  Bell,
  BarChart3,
  Eye,
  Share2,
  Lock,
  Palette,
  Sparkles,
  MousePointer2,
  Github,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";


const features = [
  {
    icon: Layout,
    title: "Drag & Drop Builder",
    description: "Build beautiful forms without code. Drag fields, customize layouts, and preview in real-time.",
  },
  {
    icon: Workflow,
    title: "Conditional Logic",
    description: "Show or hide fields based on responses. Create dynamic forms that adapt to user input.",
  },
  {
    icon: Share2,
    title: "Multiple Destinations",
    description: "Send responses to Slack, email, webhooks, or create tickets automatically.",
  },
  {
    icon: BarChart3,
    title: "Response Analytics",
    description: "Track completion rates, average time, and drop-off points. Optimize your forms with data.",
  },
];

const fieldTypes = [
  "Text", "Email", "Number", "Date", "Select", "Multi-select",
  "File Upload", "Signature", "Rating", "NPS"
];

export default function FormsProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <FormInput className="h-4 w-4" />
                <span>Form Builder</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Beautiful forms in{" "}
                <span className="text-ledger-green">minutes</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                Drag-and-drop form builder with conditional logic, integrations,
                and analytics. Create intake forms, surveys, and bug reports without code.
              </p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  Create a Form Free
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
                  No code required
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Unlimited responses
                </span>
              </div>
            </div>

            {/* Visual - Form Preview.

                DARK PANE: a genuine product mockup — the form builder canvas as
                the app renders it — so it keeps the plate treatment used for
                product UI on the paper page (see OsConsolePreview): ledger-pane
                ground, white-opacity type, ledger-mint as the only accent. The
                white/* utilities below are scoped to this pane on purpose. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7] shadow-[0_1px_0_rgba(16,25,19,0.08)]">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="font-display font-medium">Bug Report Form</h3>
                <div className="flex gap-2">
                  <button className="rounded-[2px] border border-white/12 p-2">
                    <Eye className="h-4 w-4 text-white/45" />
                  </button>
                  <button className="rounded-[2px] border border-white/12 p-2">
                    <Share2 className="h-4 w-4 text-ledger-mint" />
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-[2px] border border-white/12 p-4">
                  <label className="mb-2 block font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Bug Title *</label>
                  <div className="h-10 rounded-[2px] border border-white/12 bg-white/[0.03]" />
                </div>
                <div className="rounded-[2px] border border-white/12 p-4">
                  <label className="mb-2 block font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Severity</label>
                  <div className="flex gap-2">
                    {["Low", "Medium", "High", "Critical"].map((s, i) => (
                      <span key={i} className={`rounded-[2px] px-3 py-1.5 font-brand-mono text-[11px] uppercase tracking-[0.14em] ${i === 2 ? "bg-ledger-mint text-ledger-pane" : "border border-white/12 text-white/50"}`}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-[2px] border border-white/12 p-4">
                  <label className="mb-2 block font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Description</label>
                  <div className="h-24 rounded-[2px] border border-white/12 bg-white/[0.03]" />
                </div>
                <button className="w-full rounded-[2px] bg-ledger-mint py-3 font-brand-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ledger-pane">
                  Submit Report
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Field Types */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-8 font-display text-2xl font-semibold tracking-tight">20+ field types</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {fieldTypes.map((field, idx) => (
              <span key={idx} className="cursor-default rounded-[2px] border border-ledger-ink/12 bg-ledger-card px-4 py-2 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/65 transition hover:border-ledger-ink/25">
                {field}
              </span>
            ))}
            <span className="rounded-[2px] border border-ledger-green/40 bg-ledger-card px-4 py-2 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-green">
              +10 more
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Forms that work for you
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              Build once, use everywhere. Collect data and trigger automations.
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

      {/* Use Cases */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Built for engineering teams
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              { title: "Bug Reports", desc: "Let users submit bugs directly to your ticketing system", icon: FileText },
              { title: "Feature Requests", desc: "Collect and prioritize user feedback automatically", icon: Sparkles },
              { title: "Intake Forms", desc: "Onboard new projects with structured intake forms", icon: MousePointer2 },
            ].map((uc, idx) => (
              <div key={idx} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 text-center transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
                <uc.icon className="mx-auto mb-4 h-5 w-5 text-ledger-green" />
                <h3 className="mb-2 font-display font-semibold">{uc.title}</h3>
                <p className="text-sm text-ledger-ink/60">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Create your first form in minutes
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            No credit card required. Free for small teams.
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

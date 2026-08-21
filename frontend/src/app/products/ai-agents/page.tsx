import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, LockKeyhole, Mail, Shield, Workflow, Wrench } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { BreadcrumbJsonLd } from "@/components/marketing/StructuredData";
import type { IconCapability } from "@/components/landing/marketing-types";

export const metadata: Metadata = {
  title: "AI Agents for Business Workflows",
  description:
    "Build governed AI agents that work across CRM, email, Slack, enrichment, docs, and workflows with approvals, policy gates, and audit history.",
  alternates: { canonical: "/products/ai-agents" },
};

const capabilities: readonly IconCapability[] = [
  ["Tool access", "Give agents approved access to CRM records, email history, enrichment tools, Slack, workflows, and company context.", Wrench],
  ["Policy gates", "Block tools, require approval, restrict fields, rate-limit actions, and cap token budgets before agents act.", LockKeyhole],
  ["Workflow triggers", "Run agents when leads reply, deals change, forms arrive, tickets escalate, or workflows branch.", Workflow],
  ["Audit history", "Log every run, tool call, policy decision, approval, and output for review and governance.", Shield],
];

const useCases = [
  "Classify inbound replies and route hot leads to the right owner.",
  "Draft contextual email replies using CRM and prior conversation history.",
  "Enrich companies, summarize account activity, and update CRM fields.",
  "Escalate uncertain actions to a human before anything sensitive happens.",
];

const faqs = [
  ["Can Aexy agents send emails automatically?", "Yes, but sensitive tools can require approval based on confidence, policy, tool type, field access, or workspace rules."],
  ["Which tools can agents use?", "Agents can use configured tools for CRM records, email, enrichment, communication, workflows, and other Aexy modules."],
  ["Are agent actions auditable?", "Yes. Aexy records executions, tool calls, policy decisions, approvals, outputs, and errors."],
];

export default function AIAgentsProductPage() {
  return (
    <LedgerPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbJsonLd trail={[{ name: "AI agents", path: "/products/ai-agents" }]} />

      <div className="relative">
        <section className="px-4 pb-20 pt-32 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Bot className="h-4 w-4" />
                AI agents for business workflows
              </div>
              <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
                AI agents that work inside your company OS.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-ledger-ink/65">
                Build agents that can read company context, use approved tools, update CRM records, draft emails, trigger workflows, and ask for approval before sensitive actions.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/login" className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]">
                  Start free
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/ai-company-os" className="inline-flex items-center justify-center rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
                  See company OS
                </Link>
                <Link href="/contact" className="inline-flex items-center justify-center rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
                  Book a demo
                </Link>
              </div>
              <p className="mt-5 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/45">
                Free forever, self-hosted · No credit card
              </p>
            </div>

            {/* Dark pane — genuine product mockup; white/* utilities are intentional inside bg-ledger-pane. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bot className="h-5 w-5 text-ledger-mint" />
                  <div>
                    <div className="font-semibold">Sales agent</div>
                    <div className="text-sm text-white/50">Policy checked, tool access approved</div>
                  </div>
                </div>
                <div className="rounded-[2px] bg-ledger-mint/15 px-3 py-1 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-mint">Live</div>
              </div>
              <div className="space-y-3">
                {["Read CRM account context", "Classified reply as high intent", "Drafted follow-up email", "Created owner task", "Logged policy decision"].map((event) => (
                  <div key={event} className="flex items-center gap-3 rounded-[2px] border border-white/12 p-4 text-sm text-white/70">
                    <CheckCircle2 className="h-4 w-4 text-ledger-mint" />
                    {event}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-3xl font-display text-4xl font-semibold tracking-tight">
              Give agents useful context without giving up control.
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {capabilities.map(([title, body, Icon]) => (
                <div key={title} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
                  <Icon className="h-5 w-5 text-ledger-green" />
                  <h3 className="mt-5 font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-ledger-ink/65">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 sm:p-10 lg:grid-cols-[0.8fr_1fr]">
            <div>
              <Mail className="h-10 w-10 text-ledger-green" />
              <h2 className="mt-6 font-display text-4xl font-semibold tracking-tight">Use cases that need company context.</h2>
              <p className="mt-5 text-lg leading-8 text-ledger-ink/65">
                Aexy agents are designed for work where the answer depends on CRM records, email history, ownership, workflow state, policies, and prior activity.
              </p>
            </div>
            <div className="space-y-3">
              {useCases.map((useCase) => (
                <div key={useCase} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-5 text-ledger-ink/70">
                  {useCase}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center font-display text-4xl font-semibold tracking-tight">AI agent FAQs</h2>
            <div className="mt-10 space-y-4">
              {faqs.map(([question, answer]) => (
                <div key={question} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6">
                  <h3 className="text-lg font-semibold">{question}</h3>
                  <p className="mt-3 text-sm leading-6 text-ledger-ink/60">{answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

    </LedgerPage>
  );
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Aexy AI Agents",
  applicationCategory: "BusinessApplication",
  description:
    "Governed AI agents for CRM, email, Slack, enrichment, docs, and business workflows.",
  url: "https://aexy.io/products/ai-agents",
};

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Brain,
  BriefcaseBusiness,
  CheckCircle2,
  Code2,
  DatabaseZap,
  FileText,
  GitBranch,
  Shield,
  Users,
  Workflow,
} from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import type { IconCapability } from "@/components/landing/marketing-types";
import { LedgerPage } from "@/components/landing/LedgerPage";

export const metadata: Metadata = {
  title: "AI Company Operating System",
  description:
    "Aexy is an open-source AI company operating system for engineering, CRM, GTM, people, docs, workflows, and governed AI agents.",
  alternates: { canonical: "/ai-company-os" },
};

const modules: readonly IconCapability[] = [
  ["Engineering", "Sprints, tasks, releases, tickets, developer insights, reviews, uptime.", Code2],
  ["Revenue", "CRM, GTM intelligence, visitor identification, lead scoring, sequences, routing.", BriefcaseBusiness],
  ["Operations", "Forms, workflows, automations, reminders, approvals, notifications, handoffs.", Workflow],
  ["People", "Hiring, assessments, learning paths, performance reviews, leave, compliance.", Users],
  ["Knowledge", "Docs, Drive, AI metadata, knowledge graph, MCP tools, reporting.", FileText],
  ["AI Agents", "Policy-controlled agents with CRM, email, Slack, enrichment, docs, and workflow tools.", Bot],
];

const faqs = [
  ["Is Aexy a CRM?", "Aexy includes CRM, but it is broader than a CRM. CRM records connect to GTM, email, docs, tasks, workflows, and AI agents."],
  ["Is Aexy only for engineering teams?", "Aexy has a strong engineering foundation, but the company OS direction connects engineering with revenue, people, operations, and knowledge."],
  ["Why open source?", "Open source makes the operating layer auditable. Teams can inspect how workflows, permissions, metrics, and agent policies work."],
  ["What makes Aexy different from generic AI OS tools?", "Aexy is a real product surface with concrete modules, docs, custom objects, workflow automation, and governed agents rather than only a prompt-to-app concept."],
];

export default function AICompanyOSPage() {
  return (
    <LedgerPage className="overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="relative">
        <section className="px-4 pb-20 pt-32 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.82fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Brain className="h-4 w-4" />
                AI company operating system
              </div>
              <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
                One operating layer for your company and its AI agents.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-ledger-ink/65">
                Aexy connects engineering, CRM, GTM, people, docs, workflows, and AI agents in one open-source workspace so company context does not get trapped across tools.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/products/ai-agents" className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]">
                  Explore AI agents
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/contact" className="inline-flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
                  Book demo
                </Link>
              </div>
            </div>

            {/* Dark product pane — white/* utilities are intentional inside the plate */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
              <div className="mb-5 flex items-center gap-3">
                <DatabaseZap className="h-5 w-5 text-ledger-mint" />
                <div>
                  <div className="font-semibold">Shared company context</div>
                  <div className="text-sm text-white/55">One graph for work, customers, people, docs, and agents.</div>
                </div>
              </div>
              <div className="space-y-3">
                {["Customer viewed pricing", "Lead score crossed threshold", "Sales agent enriched account", "Task created for owner", "Engineering context linked"].map((event) => (
                  <div key={event} className="flex items-center gap-3 rounded-[2px] border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                    <CheckCircle2 className="h-4 w-4 text-ledger-mint" />
                    {event}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-ledger-ink/12 px-4 py-14 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {[
              ["Open source", "Inspect, self-host, and extend the operating layer."],
              ["Agent governed", "Tool access, approvals, budgets, and audit history."],
              ["Company-wide", "Engineering, revenue, people, operations, and knowledge together."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5">
                <h2 className="font-display text-xl font-semibold">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-ledger-ink/65">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <h2 className="font-display text-4xl font-semibold tracking-tight">What Aexy brings into one OS</h2>
              <p className="mt-5 text-lg leading-8 text-ledger-ink/65">
                Most companies buy these workflows separately. Aexy makes them part of the same system so humans and AI agents act with the same context.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {modules.map(([title, body, Icon]) => (
                <div key={title} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5">
                  <Icon className="h-5 w-5 text-ledger-green" />
                  <h3 className="mt-5 font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-ledger-ink/65">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 sm:p-10 lg:grid-cols-[0.8fr_1fr]">
            <div>
              <Shield className="h-5 w-5 text-ledger-green" />
              <h2 className="mt-6 font-display text-4xl font-semibold tracking-tight">Not a black-box AI wrapper.</h2>
              <p className="mt-5 text-lg leading-8 text-ledger-ink/65">
                Aexy is designed for teams that need control: self-hosting, visible docs, API-driven modules, permissions, policy decisions, and auditable agent execution.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {["Self-hostable", "Public docs", "Agent policies", "Audit history", "Custom objects", "Workflow engine"].map((item) => (
                <div key={item} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-5 font-semibold">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center font-display text-4xl font-semibold tracking-tight">AI company OS FAQs</h2>
            <div className="mt-10 space-y-4">
              {faqs.map(([question, answer]) => (
                <div key={question} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6">
                  <h3 className="text-lg font-semibold">{question}</h3>
                  <p className="mt-3 text-sm leading-6 text-ledger-ink/65">{answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 text-center sm:px-6">
          <h2 className="font-display text-4xl font-semibold tracking-tight">Build a company OS your agents can trust.</h2>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/contact" className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]">
              Book demo
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a href="https://github.com/aexy-io/aexy" className="inline-flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
              <SiGithub className="h-5 w-5" />
              View GitHub
            </a>
          </div>
        </section>
      </div>

    </LedgerPage>
  );
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Aexy",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Open-source AI company operating system for engineering, CRM, GTM, people, docs, workflows, and governed AI agents.",
  url: "https://aexy.io/ai-company-os",
};

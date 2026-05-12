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
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

export const metadata: Metadata = {
  title: "AI Company Operating System",
  description:
    "Aexy is an open-source AI company operating system for engineering, CRM, GTM, people, docs, workflows, and governed AI agents.",
};

const modules = [
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
    <div className="min-h-screen overflow-hidden bg-[#08090d] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.13),transparent_32%)]" />
      <LandingHeader />

      <main className="relative">
        <section className="px-4 pb-20 pt-32 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.82fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70">
                <Brain className="h-4 w-4 text-cyan-300" />
                AI company operating system
              </div>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
                One operating layer for your company and its AI agents.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-white/62">
                Aexy connects engineering, CRM, GTM, people, docs, workflows, and AI agents in one open-source workspace so company context does not get trapped across tools.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/products/ai-agents" className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black">
                  Explore AI agents
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/contact" className="inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 font-semibold text-white">
                  Book demo
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-xl bg-white p-2 text-black">
                  <DatabaseZap className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">Shared company context</div>
                  <div className="text-sm text-white/45">One graph for work, customers, people, docs, and agents.</div>
                </div>
              </div>
              <div className="space-y-3">
                {["Customer viewed pricing", "Lead score crossed threshold", "Sales agent enriched account", "Task created for owner", "Engineering context linked"].map((event) => (
                  <div key={event} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/68">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    {event}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.025] px-4 py-14 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {[
              ["Open source", "Inspect, self-host, and extend the operating layer."],
              ["Agent governed", "Tool access, approvals, budgets, and audit history."],
              ["Company-wide", "Engineering, revenue, people, operations, and knowledge together."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-white/55">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <h2 className="text-4xl font-semibold tracking-tight">What Aexy brings into one OS</h2>
              <p className="mt-5 text-lg leading-8 text-white/56">
                Most companies buy these workflows separately. Aexy makes them part of the same system so humans and AI agents act with the same context.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {modules.map(([title, body, Icon]) => (
                <div key={title as string} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                  <Icon className="h-6 w-6 text-cyan-300" />
                  <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/55">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-10 lg:grid-cols-[0.8fr_1fr]">
            <div>
              <Shield className="h-10 w-10 text-emerald-300" />
              <h2 className="mt-6 text-4xl font-semibold tracking-tight">Not a black-box AI wrapper.</h2>
              <p className="mt-5 text-lg leading-8 text-white/58">
                Aexy is designed for teams that need control: self-hosting, visible docs, API-driven modules, permissions, policy decisions, and auditable agent execution.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {["Self-hostable", "Public docs", "Agent policies", "Audit history", "Custom objects", "Workflow engine"].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-5 font-semibold">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-4xl font-semibold tracking-tight">AI company OS FAQs</h2>
            <div className="mt-10 space-y-4">
              {faqs.map(([question, answer]) => (
                <div key={question} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
                  <h3 className="text-lg font-semibold">{question}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/58">{answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 text-center sm:px-6">
          <h2 className="text-4xl font-semibold tracking-tight">Build a company OS your agents can trust.</h2>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/contact" className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black">
              Book demo
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a href="https://github.com/aexy-io/aexy" className="inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 font-semibold text-white">
              <SiGithub className="h-5 w-5" />
              View GitHub
            </a>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
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

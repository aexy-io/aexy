import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Building2, Calendar, CheckCircle2, Database, Mail, Network, Rows3, Workflow } from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

export const metadata: Metadata = {
  title: "Agent-Native CRM",
  description:
    "A flexible CRM for humans and AI agents with custom objects, Gmail and calendar sync, activity timelines, automations, sequences, and GTM intelligence.",
};

const capabilities = [
  ["Custom objects", "Model companies, people, deals, projects, renewals, partners, or any custom business object.", Database],
  ["Activity timeline", "Emails, meetings, notes, field changes, enrichment, sequences, and automation runs live on the record.", Rows3],
  ["Agent-ready tools", "Agents can search, summarize, enrich, create, and update records through governed tools.", Bot],
  ["Workflow automation", "Trigger actions from record changes, email replies, form submissions, schedule rules, and GTM signals.", Workflow],
];

const connected = [
  "Gmail and calendar sync",
  "GTM visitor identification",
  "Lead scoring and routing",
  "Outreach sequences",
  "Workflow automations",
  "AI-computed fields",
  "Notes and activities",
  "Outbound webhooks",
];

const faqs = [
  ["Is Aexy CRM open source?", "Aexy has an open-source core and can be self-hosted. Teams can inspect and extend the system instead of locking relationship data inside a black box."],
  ["How is this different from a sales-only CRM?", "Aexy CRM is part of a company OS. Records can connect to GTM, docs, workflows, tickets, engineering work, email, and AI agents."],
  ["Can AI agents update CRM records?", "Yes. Agents can use CRM tools, but access can be restricted with policies, approvals, field limits, and audit logs."],
];

export default function CRMProductPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#08090d] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.15),transparent_32%),radial-gradient(circle_at_75%_10%,rgba(245,158,11,0.12),transparent_30%)]" />
      <LandingHeader />

      <main className="relative">
        <section className="px-4 pb-20 pt-32 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-4 py-2 text-sm text-violet-200">
                <Building2 className="h-4 w-4" />
                Agent-native CRM
              </div>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
                A CRM your team and AI agents can actually operate.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-white/62">
                Manage companies, people, deals, activities, email, calendar, automations, and GTM signals in a flexible CRM that belongs inside your company OS.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/contact" className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black">
                  Book CRM demo
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/products/ai-agents" className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 font-semibold text-white">
                  See AI agents
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="font-semibold">Acme Corp</div>
                  <div className="text-sm text-white/45">High intent account, owner assigned</div>
                </div>
                <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">Healthy</div>
              </div>
              <div className="space-y-3">
                {[
                  ["Email synced", Mail],
                  ["Meeting linked", Calendar],
                  ["GTM score updated", Network],
                  ["Agent summary generated", Bot],
                ].map(([event, Icon]) => (
                  <div key={event as string} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/68">
                    <Icon className="h-4 w-4 text-violet-300" />
                    {event}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-3xl text-4xl font-semibold tracking-tight">
              Flexible enough for your data model. Structured enough for agents.
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {capabilities.map(([title, body, Icon]) => (
                <div key={title as string} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                  <Icon className="h-6 w-6 text-violet-300" />
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
              <Network className="h-10 w-10 text-cyan-300" />
              <h2 className="mt-6 text-4xl font-semibold tracking-tight">CRM connected to the rest of the company.</h2>
              <p className="mt-5 text-lg leading-8 text-white/58">
                Aexy CRM is not an isolated database. It is the customer layer for GTM, automations, documents, email, and AI agent work.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {connected.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-medium text-white/72">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-4xl font-semibold tracking-tight">CRM FAQs</h2>
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
      </main>

      <LandingFooter />
    </div>
  );
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Aexy CRM",
  applicationCategory: "BusinessApplication",
  description:
    "Agent-native CRM with custom objects, Gmail and calendar sync, activity timelines, automations, sequences, and GTM intelligence.",
  url: "https://aexy.io/products/crm",
};

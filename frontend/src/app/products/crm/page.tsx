import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Building2, Calendar, CheckCircle2, Database, Mail, Network, Rows3, Workflow } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { BreadcrumbJsonLd } from "@/components/marketing/StructuredData";
import { AuthorByline, defaultAuthor, organizationJsonLd, personJsonLd } from "@/components/marketing/AuthorByline";
import type { IconCapability, IconRow } from "@/components/landing/marketing-types";
import { ProductShot } from "@/components/marketing/ProductShot";
import crmShot from "../../../../public/marketing/home/home-sell@2x.webp";

export const metadata: Metadata = {
  title: "Agent-Native CRM — Open-Source Alternative to Attio & HubSpot",
  description:
    "A flexible CRM for humans and AI agents with custom objects, Gmail and calendar sync, activity timelines, automations, sequences, and GTM intelligence. Open source and self-hostable.",
  alternates: { canonical: "/products/crm" },
};

const capabilities: readonly IconCapability[] = [
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
  ["How does Aexy CRM compare to Attio or HubSpot?", "Like Attio, Aexy has a schema-flexible data model with custom objects. Like HubSpot, it includes sequences, routing, and GTM signals. Unlike both, it is open source, self-hostable, agent-native, and connected to engineering, docs, and workflows in the same workspace."],
  ["What does Aexy CRM cost?", "Self-hosting the open-source core is free. Cloud plans add managed infrastructure, and enterprise plans add advanced controls — see the pricing page for current tiers."],
];

const comparisonRows: ReadonlyArray<readonly [string, string, string, string]> = [
  ["Data model", "Schema-flexible custom objects", "Flexible objects", "Fixed objects; custom objects on paid tiers"],
  ["AI agents on records", "Governed agents: search, enrich, update, draft — with policy gates and audit logs", "AI research assistants", "AI assists in CRM surface"],
  ["AI-computed fields", "LLM-computed attributes from your own prompt templates", "AI enrichment features", "AI within Breeze features"],
  ["Engineering context", "Tickets, sprints, releases link to customer records", "Not included", "Not included"],
  ["Visitor ID & lead scoring", "Built in — anonymous visitors resolve to CRM records with auto rescoring", "Via integrations", "Higher tiers / add-ons"],
  ["Email deliverability", "Domain warming, bounce/complaint monitoring, auto-pause built in", "Not included", "Third-party tools"],
  ["Email & calendar sync", "Gmail and calendar sync included", "Included", "Included"],
  ["Open source / self-host", "Yes — free self-hosted option", "No", "No"],
];

export default function CRMProductPage() {
  return (
    <LedgerPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbJsonLd trail={[{ name: "CRM", path: "/products/crm" }]} />

      <div className="relative">
        <section className="px-4 pb-20 pt-32 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Building2 className="h-4 w-4" />
                Agent-native CRM
              </div>
              <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
                A CRM your team and AI agents can actually operate.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-ledger-ink/65">
                Manage companies, people, deals, activities, email, calendar, automations, and GTM signals in a flexible CRM that belongs inside your company OS.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/login" className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]">
                  Start free
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/products/ai-agents" className="inline-flex items-center justify-center rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
                  See AI agents
                </Link>
                <Link href="/contact" className="inline-flex items-center justify-center rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
                  Book a CRM demo
                </Link>
              </div>
              <p className="mt-5 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/45">
                Free forever, self-hosted · No credit card
              </p>
            </div>

            {/* Dark pane — genuine product mockup; white/* utilities are intentional inside bg-ledger-pane. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="font-semibold">Acme Corp</div>
                  <div className="text-sm text-white/50">High intent account, owner assigned</div>
                </div>
                <div className="rounded-[2px] bg-ledger-mint/15 px-3 py-1 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-mint">Healthy</div>
              </div>
              <div className="space-y-3">
                {([
                  ["Email synced", Mail],
                  ["Meeting linked", Calendar],
                  ["GTM score updated", Network],
                  ["Agent summary generated", Bot],
                ] as readonly IconRow[]).map(([event, Icon]) => (
                  <div key={event} className="flex items-center gap-3 rounded-[2px] border border-white/12 p-4 text-sm text-white/70">
                    <Icon className="h-4 w-4 text-ledger-mint" />
                    {event}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Real screenshot, captured by e2e/tools/capture-marketing-shots.ts.
            This page previously argued entirely in prose — a visitor arriving
            from "open source crm" never saw the product before the signup ask. */}
        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl">
              <div className="mb-4 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                In the product
              </div>
              <h2 className="mb-4 font-display text-4xl font-semibold tracking-tight">
                Your pipeline, with the engineering context attached.
              </h2>
              <p className="text-lg leading-relaxed text-ledger-ink/65">
                Deals, stages, and values in a table you define — linked to the companies, threads, and shipped work behind them.
              </p>
            </div>
            <ProductShot
              src={crmShot}
              alt="Aexy CRM deals table showing deal names, stages, values, and the companies each deal is linked to"
              figure="FIG. 01"
              caption="CRM — deals by stage, value, and linked company"
            />
          </div>
        </section>

        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-3xl font-display text-4xl font-semibold tracking-tight">
              Flexible enough for your data model. Structured enough for agents.
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
              <Network className="h-10 w-10 text-ledger-green" />
              <h2 className="mt-6 font-display text-4xl font-semibold tracking-tight">CRM connected to the rest of the company.</h2>
              <p className="mt-5 text-lg leading-8 text-ledger-ink/65">
                Aexy CRM is not an isolated database. It is the customer layer for GTM, automations, documents, email, and AI agent work.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {connected.map((item) => (
                <div key={item} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-4 text-sm font-medium text-ledger-ink/75">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <h2 className="font-display text-4xl font-semibold tracking-tight">Aexy CRM vs Attio vs HubSpot</h2>
              <p className="mt-5 text-lg leading-8 text-ledger-ink/65">
                Evaluating CRMs? Here is where Aexy differs from the tools revenue teams usually shortlist.
              </p>
            </div>
            <div className="mt-10 overflow-x-auto rounded-[2px] border border-ledger-ink/12">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ledger-ink/12 bg-ledger-card">
                    <th className="px-5 py-4 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-ink/50"> </th>
                    <th className="px-5 py-4 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-green">Aexy</th>
                    <th className="px-5 py-4 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-ink/60">Attio</th>
                    <th className="px-5 py-4 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-ink/60">HubSpot</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map(([dimension, aexy, attio, hubspot]) => (
                    <tr key={dimension} className="border-b border-ledger-ink/12 bg-ledger-card/60 last:border-b-0">
                      <td className="px-5 py-4 font-medium text-ledger-ink/70">{dimension}</td>
                      <td className="px-5 py-4 leading-6 text-ledger-ink/85">{aexy}</td>
                      <td className="px-5 py-4 leading-6 text-ledger-ink/55">{attio}</td>
                      <td className="px-5 py-4 leading-6 text-ledger-ink/55">{hubspot}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link href="/compare/attio" className="inline-flex items-center gap-1.5 font-semibold text-ledger-green transition hover:text-ledger-ink">
                Full Attio comparison
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/compare/hubspot" className="inline-flex items-center gap-1.5 font-semibold text-ledger-green transition hover:text-ledger-ink">
                Full HubSpot comparison
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/pricing" className="inline-flex items-center gap-1.5 font-semibold text-ledger-green transition hover:text-ledger-ink">
                Pricing
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center font-display text-4xl font-semibold tracking-tight">CRM FAQs</h2>
            <div className="mt-10 space-y-4">
              {faqs.map(([question, answer]) => (
                <div key={question} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6">
                  <h3 className="text-lg font-semibold">{question}</h3>
                  <p className="mt-3 text-sm leading-6 text-ledger-ink/60">{answer}</p>
                </div>
              ))}
            </div>
            <p className="mb-3 mt-12 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-ink/50">Written by</p>
            <AuthorByline author={defaultAuthor} />
          </div>
        </section>
      </div>

    </LedgerPage>
  );
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Aexy CRM",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Agent-native CRM with custom objects, Gmail and calendar sync, activity timelines, automations, sequences, and GTM intelligence. Open-source alternative to Attio and HubSpot.",
      url: "https://aexy.io/products/crm",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Open-source self-hosted option available.",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
    personJsonLd(),
    organizationJsonLd(),
  ],
};

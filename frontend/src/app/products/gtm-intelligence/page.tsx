import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, CheckCircle2, Crosshair, Eye, GitBranch, Mail, Route, Shield, Target, TrendingUp } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { BreadcrumbJsonLd } from "@/components/marketing/StructuredData";
import type { IconCapability } from "@/components/landing/marketing-types";

export const metadata: Metadata = {
  title: "GTM Intelligence Platform",
  description:
    "Turn website visits and customer signals into pipeline with visitor identification, ICP scoring, lead routing, outreach, alerts, and CRM-connected GTM workflows.",
  alternates: { canonical: "/products/gtm-intelligence" },
};

const workflow: readonly IconCapability[] = [
  ["Capture", "Track page views, UTMs, scroll depth, forms, email clicks, and high-intent events.", Eye],
  ["Identify", "Resolve anonymous visits into company/account context and link known contacts into CRM.", Target],
  ["Score", "Combine firmographic, behavioral, engagement, and ICP signals into lead/account scores.", TrendingUp],
  ["Route", "Assign, alert, enroll, or hand off based on score, owner, stage, SLA, and playbook.", Route],
];

const modules = [
  "Visitor identification",
  "ICP templates",
  "Lead scoring",
  "Routing and SLA",
  "Outreach sequences",
  "Customer health",
  "Expansion playbooks",
  "Competitor intelligence",
  "SEO/content gap analysis",
  "Outbound webhooks",
];

const faqs = [
  ["Is GTM Intelligence separate from CRM?", "No. Aexy GTM intelligence feeds the CRM record, activity timeline, routing rules, sequences, alerts, and customer-health workflows."],
  ["Can we use our own enrichment providers?", "Yes. Aexy uses provider slots so teams can configure or swap data providers without changing the GTM workflow model."],
  ["What happens after a visitor is identified?", "Aexy can score the account, link it to CRM, alert the right team, route ownership, enroll a sequence, or trigger a workflow."],
];

export default function GTMIntelligenceProductPage() {
  return (
    <LedgerPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbJsonLd trail={[{ name: "GTM intelligence", path: "/products/gtm-intelligence" }]} />

      <div className="relative">
        <section className="px-4 pb-20 pt-32 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Crosshair className="h-4 w-4" />
                GTM intelligence platform
              </div>
              <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
                Turn website and customer signals into pipeline.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-ledger-ink/65">
                Identify visitors, score accounts, route hot leads, trigger sequences, monitor customer health, and connect every GTM signal back to CRM and workflows.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/login" className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]">
                  Start free
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/products/crm" className="inline-flex items-center justify-center rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
                  See CRM
                </Link>
                <Link href="/contact" className="inline-flex items-center justify-center rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
                  Book a GTM demo
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
                  <Crosshair className="h-5 w-5 text-ledger-mint" />
                  <div>
                    <div className="font-semibold">High-intent account</div>
                    <div className="text-sm text-white/50">Pricing + docs + competitor page</div>
                  </div>
                </div>
                <div className="rounded-[2px] bg-ledger-mint/15 px-3 py-1 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-mint">Score 86</div>
              </div>
              <div className="space-y-3">
                {["Company identified", "ICP matched", "Owner routed", "Sequence suggested", "Slack alert queued"].map((event) => (
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
              One GTM workflow from first visit to expansion.
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {workflow.map(([title, body, Icon]) => (
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
              <Bell className="h-10 w-10 text-ledger-green" />
              <h2 className="mt-6 font-display text-4xl font-semibold tracking-tight">More than visitor identification.</h2>
              <p className="mt-5 text-lg leading-8 text-ledger-ink/65">
                Aexy&apos;s GTM system includes the downstream actions that turn signals into revenue motion, not just a dashboard of anonymous traffic.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {modules.map((module) => (
                <div key={module} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-4 text-sm font-medium text-ledger-ink/75">
                  {module}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {([
              ["Connected to CRM", "Every signal can attach to records, accounts, contacts, deals, activities, and automations.", GitBranch],
              ["Compliance-aware", "Consent, suppression, audit checks, and routing rules keep GTM automation controlled.", Shield],
              ["Email and outreach", "Sequences, reply classification, alerts, and handoffs keep momentum after the signal.", Mail],
            ] as readonly IconCapability[]).map(([title, body, Icon]) => (
              <div key={title} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
                <Icon className="h-5 w-5 text-ledger-green" />
                <h3 className="mt-5 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-ledger-ink/65">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center font-display text-4xl font-semibold tracking-tight">GTM intelligence FAQs</h2>
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
  name: "Aexy GTM Intelligence",
  applicationCategory: "BusinessApplication",
  description:
    "GTM intelligence platform for visitor identification, lead scoring, routing, outreach, and CRM-connected revenue workflows.",
  url: "https://aexy.io/products/gtm-intelligence",
};

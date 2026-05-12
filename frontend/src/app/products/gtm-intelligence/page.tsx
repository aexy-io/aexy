import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, CheckCircle2, Crosshair, Eye, GitBranch, Mail, Route, Shield, Target, TrendingUp } from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

export const metadata: Metadata = {
  title: "GTM Intelligence Platform",
  description:
    "Turn website visits and customer signals into pipeline with visitor identification, ICP scoring, lead routing, outreach, alerts, and CRM-connected GTM workflows.",
};

const workflow = [
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
    <div className="min-h-screen overflow-hidden bg-[#08090d] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.15),transparent_32%),radial-gradient(circle_at_75%_10%,rgba(236,72,153,0.12),transparent_30%)]" />
      <LandingHeader />

      <main className="relative">
        <section className="px-4 pb-20 pt-32 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-400/10 px-4 py-2 text-sm text-indigo-200">
                <Crosshair className="h-4 w-4" />
                GTM intelligence platform
              </div>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
                Turn website and customer signals into pipeline.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-white/62">
                Identify visitors, score accounts, route hot leads, trigger sequences, monitor customer health, and connect every GTM signal back to CRM and workflows.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/contact" className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black">
                  Book GTM demo
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/products/crm" className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 font-semibold text-white">
                  See CRM
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-indigo-500 p-2">
                    <Crosshair className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">High-intent account</div>
                    <div className="text-sm text-white/45">Pricing + docs + competitor page</div>
                  </div>
                </div>
                <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">Score 86</div>
              </div>
              <div className="space-y-3">
                {["Company identified", "ICP matched", "Owner routed", "Sequence suggested", "Slack alert queued"].map((event) => (
                  <div key={event} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/68">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
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
              One GTM workflow from first visit to expansion.
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {workflow.map(([title, body, Icon]) => (
                <div key={title as string} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                  <Icon className="h-6 w-6 text-indigo-300" />
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
              <Bell className="h-10 w-10 text-amber-300" />
              <h2 className="mt-6 text-4xl font-semibold tracking-tight">More than visitor identification.</h2>
              <p className="mt-5 text-lg leading-8 text-white/58">
                Aexy's GTM system includes the downstream actions that turn signals into revenue motion, not just a dashboard of anonymous traffic.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {modules.map((module) => (
                <div key={module} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-medium text-white/72">
                  {module}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {[
              ["Connected to CRM", "Every signal can attach to records, accounts, contacts, deals, activities, and automations.", GitBranch],
              ["Compliance-aware", "Consent, suppression, audit checks, and routing rules keep GTM automation controlled.", Shield],
              ["Email and outreach", "Sequences, reply classification, alerts, and handoffs keep momentum after the signal.", Mail],
            ].map(([title, body, Icon]) => (
              <div key={title as string} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <Icon className="h-6 w-6 text-violet-300" />
                <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/55">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-4xl font-semibold tracking-tight">GTM intelligence FAQs</h2>
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
  name: "Aexy GTM Intelligence",
  applicationCategory: "BusinessApplication",
  description:
    "GTM intelligence platform for visitor identification, lead scoring, routing, outreach, and CRM-connected revenue workflows.",
  url: "https://aexy.io/products/gtm-intelligence",
};

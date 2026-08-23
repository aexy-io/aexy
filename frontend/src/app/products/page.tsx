import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LedgerPage } from "@/components/landing/LedgerPage";

/**
 * The index that was missing.
 *
 * There are 29 product pages and, until now, no page listing them. The footer
 * carried the whole catalogue as a single column, which at 375px was 29 stacked
 * rows of link — and three pages (Booking, Reminders, Uptime) were not in it at
 * all, so they shipped crawlable and unreachable.
 *
 * `marketingConversion.test.ts` has a case asserting that no BreadcrumbList
 * points at a section index that does not exist, and /products was on that
 * list. It no longer is.
 */

export const metadata: Metadata = {
  title: "Products",
  description:
    "Every module of the Aexy company OS — planning, CRM, service desk, agents, analytics, people ops and operations — in one system, on one schema.",
  alternates: { canonical: "/products" },
  openGraph: {
    title: "Products",
    description: "Every module of the Aexy company OS, in one system, on one schema.",
    url: "/products",
    type: "website",
  },
};

const GROUPS: { title: string; blurb: string; items: [string, string, string][] }[] = [
  {
    title: "Work & delivery",
    blurb: "Plan it, ship it, and measure what happened.",
    items: [
      ["planning", "Sprint Planning", "Sprints, epics, stories, planning poker and retrospectives."],
      ["tickets", "Ticketing", "Tasks, bugs and stories, with the projects and templates around them."],
      ["tracking", "Activity Tracking", "Standups, blockers, time entries and the macOS tracker."],
      ["analytics", "Engineering Insights", "Velocity, review load, PR size and delivery forecasts from real git history."],
      ["reports", "Reports", "Build your own question, schedule it, export the answer."],
      ["dashboard", "Dashboard", "Your work list on the front door, and an 84-widget grid behind it."],
    ],
  },
  {
    title: "Customers",
    blurb: "From the first anonymous visit to the renewal.",
    items: [
      ["crm", "CRM", "Custom objects, deals, sequences and activity timelines."],
      ["gtm-intelligence", "GTM Intelligence", "Visitor identification, lead scoring, routing and intent."],
      ["email-marketing", "Email Marketing", "Campaigns, automation and the deliverability infrastructure."],
      ["service-desk", "Service Desk", "Email intake, pending-with handoffs and a working-hours clock."],
      ["forms", "Forms", "Public form builder with conditional logic and routing."],
      ["booking", "Booking", "Scheduling pages, team availability and RSVP."],
    ],
  },
  {
    title: "Knowledge & data",
    blurb: "The things everyone needs to find later.",
    items: [
      ["docs", "Documentation", "Docs, the knowledge graph and generation from code."],
      ["drive", "Drive", "Files with AI tagging, and smart views instead of folders."],
      ["tables", "Tables", "Typed columns and saved views for the data in a shared sheet."],
    ],
  },
  {
    title: "AI & automation",
    blurb: "Work that happens without anybody starting it.",
    items: [
      ["ai-agents", "AI Agents", "LangGraph agents with real tools and real boundaries."],
      ["automations", "Automations", "Triggers from every module, durable execution, agent policies."],
      ["mcp", "MCP Server", "Connect Claude, Codex, Cursor and VS Code to your company data."],
    ],
  },
  {
    title: "People",
    blurb: "Hiring through to compliance, on one org chart.",
    items: [
      ["organization", "Organization", "Departments, teams, positions — and the access that follows."],
      ["hiring", "Technical Hiring", "Assessments, candidates and structured scoring."],
      ["reviews", "Performance Reviews", "Cycles, goals and peer feedback."],
      ["learning", "Learning & Dev", "Paths, courses and completion tracking."],
      ["leave", "Leave", "Policies, balances, approvals and a team calendar."],
      ["compliance", "Compliance", "Mandatory training, certification expiry and the audit trail."],
      ["reminders", "Reminders", "Recurring obligations with escalation."],
    ],
  },
  {
    title: "Operations",
    blurb: "Keeping it up, and telling people when it is not.",
    items: [
      ["uptime", "Uptime", "Endpoint monitoring that opens and closes its own incidents."],
      ["oncall", "On-Call", "Team rotations, swaps and calendar sync."],
      ["chat", "Chat & Notifications", "One delivery system across in-app, email, push and Slack."],
      ["community", "Community", "A public forum your team runs from inside the workspace."],
    ],
  },
];

export default function ProductsIndexPage() {
  const total = GROUPS.reduce((n, g) => n + g.items.length, 0);

  return (
    <LedgerPage>
      <section className="px-6 pb-12 pt-20 md:pt-28">
        <div className="mx-auto max-w-4xl text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-[2px] border border-ledger-ink/12 bg-ledger-card px-3 py-1.5 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-green">
            Products
          </span>
          <h1 className="mb-5 font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            One system, {total} modules
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-ledger-ink/60">
            Not a suite of products that integrate. One schema, one permission
            model, one audit trail — so a deal, a sprint task and a support
            ticket can reference each other without a sync job in between.
          </p>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section key={group.title} className="px-6 pb-16">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 border-b border-ledger-ink/12 pb-4">
              <h2 className="font-display text-2xl font-semibold tracking-tight">{group.title}</h2>
              <p className="mt-1 text-ledger-ink/55">{group.blurb}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map(([slug, label, blurb]) => (
                <Link
                  key={slug}
                  href={`/products/${slug}`}
                  className="group h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
                >
                  <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold">
                    {label}
                    <ArrowRight
                      className="h-4 w-4 text-ledger-green opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                      aria-hidden
                    />
                  </h3>
                  <p className="text-sm leading-relaxed text-ledger-ink/60">{blurb}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight">
            Turn on the ones you need
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-ledger-ink/60">
            Every module is switchable per workspace and per department. Nobody
            has to look at a sidebar full of things their job does not involve.
          </p>
          <Link
            href="/login"
            className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
          >
            Get started free
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>
    </LedgerPage>
  );
}

import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  // `absolute` because the title already carries the brand; the root
  // layout's "%s | Aexy" template would otherwise render it twice.
  title: { absolute: "Aexy for Revenue Teams — Agent-Native CRM & GTM Intelligence" },
  description:
    "Aexy gives revenue teams an agent-native CRM with visitor identification, lead scoring, sequences, and routing — connected to engineering, docs, and workflows. An open-source alternative to HubSpot and Attio.",
  alternates: { canonical: "/for/revenue-teams" },
};

export default function RevenueTeamsPage() {
  return (
    <SeoLandingPage
      path="/for/revenue-teams"
      eyebrow="For revenue teams"
      title="A CRM that sees the whole company, not just the pipeline."
      description="Aexy gives GTM teams an agent-native CRM with visitor identification, ICP scoring, sequences, and routing — connected to product, engineering, docs, and the commitments your company actually made to each customer."
      secondaryCta="Book a GTM demo"
      proofPoints={[
        "CRM connected to execution context.",
        "GTM signals become routed tasks and workflows.",
        "Agents can summarize, enrich, draft, and escalate with policy controls.",
      ]}
      painPoints={[
        {
          problem: "Your CRM has no idea what engineering shipped for a customer, so renewals and expansion calls run blind.",
          solution: "Customer records link to tickets, releases, and engineering work in the same workspace.",
        },
        {
          problem: "High-intent visitors hit your site and nobody finds out until the deal shows up in a competitor's pipeline.",
          solution: "Visitor identification and ICP scoring route hot accounts to owners with next actions, automatically.",
        },
        {
          problem: "Reps spend hours a week on data entry, enrichment, and follow-up drafts.",
          solution: "Governed AI agents enrich records, summarize accounts, classify replies, and draft follow-ups under policy gates.",
        },
        {
          problem: "Sales-to-success and sales-to-engineering handoffs live in Slack threads that get lost.",
          solution: "Handoffs are workflows: CRM-linked tickets, release updates, and customer summaries with owners and SLAs.",
        },
      ]}
      sections={[
        { title: "Prioritize accounts", body: "Bring account, visitor, and ICP context into one workflow.", items: ["Visitor context", "ICP scoring", "Account health"] },
        { title: "Act faster", body: "Turn signals into owner tasks, sequences, and handoffs.", items: ["Routing", "Alerts", "Follow-up drafts"] },
        { title: "Close handoffs", body: "Connect sales and success promises to product and engineering work.", items: ["CRM-linked tickets", "Release updates", "Customer summaries"] },
      ]}
      comparison={{
        heading: "How Aexy compares to HubSpot and Attio",
        description:
          "HubSpot and Attio are strong CRMs — for sales data. Aexy is built for teams that need customer data connected to engineering, workflows, and AI agents, with an open-source path.",
        competitorLabel: "HubSpot / Attio",
        rows: [
          ["Scope", "CRM + GTM intelligence inside a company OS: engineering, docs, workflows, people, and agents share one context.", "CRM and sales/marketing suite; engineering and ops live in other tools."],
          ["AI agents", "Agent-native: agents read and update records through governed tools with policy gates, approvals, and audit history.", "AI assists within the CRM surface; no cross-company agent context."],
          ["Visitor intent", "Anonymous visitors resolve to CRM records via email, form, tracking-link, and company-IP matching — with automatic lead rescoring.", "Available via add-ons or higher tiers."],
          ["AI-computed fields", "LLM-computed CRM attributes from your own prompt templates, refreshed on the triggers you choose.", "AI assist features within each product's surface."],
          ["Email deliverability", "Built-in sending-domain warming with bounce/complaint monitoring and auto-pause.", "Typically handled by separate deliverability tooling."],
          ["Data model", "Schema-flexible custom objects for companies, people, deals, renewals, partners, or anything else.", "Attio: flexible model. HubSpot: fixed objects plus paid custom objects."],
          ["Ownership", "Open source and self-hostable; exportable data, auditable logic.", "Closed SaaS; per-seat pricing grows with the team."],
        ],
        links: [
          ["Full HubSpot comparison", "/compare/hubspot"],
          ["Full Attio comparison", "/compare/attio"],
          ["Full Salesforce comparison", "/compare/salesforce"],
        ],
      }}
      showPricingCta
      faqs={[
        ["Can Aexy replace HubSpot or Attio?", "Yes, for teams that want CRM, visitor identification, lead scoring, sequences, and routing in one place. Aexy adds what they don't have: engineering context, company-wide workflows, governed AI agents, and an open-source self-hosted option."],
        ["Does Aexy help with website intent?", "Yes. GTM Intelligence identifies visitors, scores them against your ICP, and routes high-intent accounts to owners with alerts and next actions."],
        ["How do agents help revenue teams?", "Agents can enrich records, summarize accounts, classify replies, draft follow-ups, and route next steps — under policies, approvals, and a full audit trail."],
        ["What does migration from another CRM look like?", "Import core objects, map custom fields into Aexy's schema-flexible model, then move workflows over one at a time. Start with the workflow that needs engineering or ops context most."],
      ]}
      relatedLinks={[["GTM intelligence", "/products/gtm-intelligence"], ["CRM product", "/products/crm"], ["Agent-native CRM", "/agent-native-crm"], ["Pricing", "/pricing"]]}
      schema={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Aexy for Revenue Teams",
        description: "Agent-native CRM and GTM intelligence for revenue teams — an open-source alternative to HubSpot and Attio.",
      }}
    />
  );
}

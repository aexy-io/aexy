import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "GTM Intelligence Platform",
  description: "Aexy GTM Intelligence connects website visitors, ICP scoring, routing, CRM context, workflows, and AI agents for product-led and technical revenue teams.",
};

const faqs: Array<[string, string]> = [
  ["What is a GTM intelligence platform?", "It combines website, customer, account, CRM, and workflow signals so teams can prioritize, route, and act on the right opportunities."],
  ["Does Aexy include website visitor identification?", "Aexy includes GTM workflows for visitor context, scoring, routing, alerts, account health, expansion, and competitor intelligence."],
  ["How is this different from a standalone enrichment tool?", "Aexy connects GTM signals to CRM, docs, tickets, workflows, and AI agents so signals become action instead of another dashboard."],
];

export default function GtmIntelligencePlatformPage() {
  return (
    <SeoLandingPage
      eyebrow="GTM intelligence platform"
      title="Turn market and customer signals into routed work."
      description="Aexy brings visitor context, ICP scoring, CRM records, account health, routing, workflows, and AI agents into one operating layer for revenue and product teams."
      proofPoints={[
        "Connect visitor, company, account, CRM, and workflow signals.",
        "Route high-intent accounts to owners with clear next actions.",
        "Use AI agents to summarize, enrich, draft, and trigger follow-up workflows.",
      ]}
      sections={[
        {
          title: "Identify intent",
          body: "Understand which accounts are active, what they viewed, how they fit your ICP, and what should happen next.",
          items: ["Visitor context", "ICP scoring", "Account health"],
        },
        {
          title: "Route action",
          body: "Convert signals into owner tasks, alerts, sequences, Slack notifications, and CRM updates.",
          items: ["Lead routing", "SLA workflows", "Sales handoffs"],
        },
        {
          title: "Close the loop",
          body: "Tie GTM motion back to product, engineering, docs, and customer context for better follow-through.",
          items: ["Engineering handoffs", "Expansion workflows", "Competitor tracking"],
        },
      ]}
      faqs={faqs}
      relatedLinks={[
        ["GTM product", "/products/gtm-intelligence"],
        ["CRM product", "/products/crm"],
        ["Engineering to GTM handoff", "/use-cases/engineering-to-gtm-handoff"],
        ["HubSpot comparison", "/compare/hubspot"],
      ]}
      schema={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Aexy GTM Intelligence",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: "GTM intelligence platform for visitor context, ICP scoring, routing, CRM workflows, and AI agents.",
      }}
    />
  );
}

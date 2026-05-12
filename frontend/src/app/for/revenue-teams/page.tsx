import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "Aexy for Revenue Teams",
  description: "Aexy helps revenue teams connect CRM, GTM intelligence, email, workflows, customer context, and AI agents with product and engineering work.",
};

export default function RevenueTeamsPage() {
  return (
    <SeoLandingPage
      eyebrow="For revenue teams"
      title="Connect revenue work to the rest of the company."
      description="Aexy gives GTM teams CRM context, visitor intelligence, routing, workflows, and AI agents connected to product, engineering, docs, and customer commitments."
      proofPoints={["CRM connected to execution context.", "GTM signals become routed tasks and workflows.", "Agents can summarize, enrich, draft, and escalate with policy controls."]}
      sections={[
        { title: "Prioritize accounts", body: "Bring account, visitor, and ICP context into one workflow.", items: ["Visitor context", "ICP scoring", "Account health"] },
        { title: "Act faster", body: "Turn signals into owner tasks, sequences, and handoffs.", items: ["Routing", "Alerts", "Follow-up drafts"] },
        { title: "Close handoffs", body: "Connect sales and success promises to product and engineering work.", items: ["CRM-linked tickets", "Release updates", "Customer summaries"] },
      ]}
      faqs={[
        ["Can Aexy replace a CRM?", "Aexy includes CRM and can replace traditional CRM workflows for teams that want CRM connected to the company OS."],
        ["Does Aexy help with website intent?", "Yes. GTM Intelligence connects visitor, ICP, account, and workflow signals."],
        ["How do agents help revenue teams?", "Agents can enrich records, summarize accounts, classify replies, draft follow-ups, and route next steps under policies."],
      ]}
      relatedLinks={[["GTM intelligence", "/products/gtm-intelligence"], ["CRM product", "/products/crm"], ["Agent-native CRM", "/agent-native-crm"], ["HubSpot comparison", "/compare/hubspot"]]}
      schema={{ "@context": "https://schema.org", "@type": "WebPage", name: "Aexy for Revenue Teams" }}
    />
  );
}

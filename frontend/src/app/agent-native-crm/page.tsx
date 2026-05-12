import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "Agent-Native CRM",
  description: "Aexy is an agent-native CRM for teams that want customer records, activities, workflows, GTM signals, and AI agents in one open company OS.",
};

const faqs: Array<[string, string]> = [
  ["What is an agent-native CRM?", "It is a CRM designed so approved AI agents can read context, update records, trigger workflows, and ask humans for approval when actions are sensitive."],
  ["Can Aexy replace a traditional CRM?", "For many technical teams, yes. Aexy combines CRM records with GTM signals, email context, docs, workflow automation, and engineering handoffs."],
  ["How does Aexy control agent actions?", "Agents can be limited by policies, tool permissions, approval gates, field restrictions, and audit logs."],
];

export default function AgentNativeCrmPage() {
  return (
    <SeoLandingPage
      eyebrow="Agent-native CRM"
      title="A CRM your team and AI agents can operate together."
      description="Aexy connects customer records, GTM signals, email history, workflow state, docs, and engineering context so agents can help with real revenue work without losing control."
      proofPoints={[
        "Custom CRM objects, relationships, activities, and automations.",
        "AI agents can enrich, summarize, route, draft, and update with governed tool access.",
        "Open-source/self-hostable path for teams that want control over customer data.",
      ]}
      sections={[
        {
          title: "Customer context",
          body: "Keep contacts, companies, deals, activities, notes, and ownership in a CRM that can connect to the rest of company work.",
          items: ["Custom objects", "Activity timelines", "Account ownership"],
        },
        {
          title: "Agent workflows",
          body: "Use agents for the busywork around CRM hygiene, lead triage, enrichment, summaries, follow-ups, and routing.",
          items: ["Lead qualification", "Record enrichment", "Follow-up drafts"],
        },
        {
          title: "Execution handoff",
          body: "Connect CRM changes to tickets, docs, projects, and internal workflows so customer commitments do not disappear after a sales call.",
          items: ["GTM to engineering", "Workflow triggers", "Audit history"],
        },
      ]}
      faqs={faqs}
      relatedLinks={[
        ["CRM product", "/products/crm"],
        ["AI agents", "/products/ai-agents"],
        ["GTM intelligence", "/products/gtm-intelligence"],
        ["HubSpot comparison", "/compare/hubspot"],
      ]}
      schema={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Aexy Agent-Native CRM",
        applicationCategory: "CRMApplication",
        operatingSystem: "Web",
        description: "Agent-native CRM connected to GTM, engineering, docs, workflows, and governed AI agents.",
      }}
    />
  );
}

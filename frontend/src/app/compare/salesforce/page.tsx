import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/ComparisonPage";

export const metadata: Metadata = {
  title: "Aexy vs Salesforce",
  description: "Compare Aexy and Salesforce for teams that want open CRM, GTM intelligence, engineering context, workflows, docs, and governed AI agents.",
};

export default function SalesforceComparisonPage() {
  return (
    <ComparisonPage
      competitor="Salesforce"
      eyebrow="Aexy vs Salesforce"
      title="A Salesforce alternative for teams that want CRM connected to company execution."
      description="Salesforce is a mature enterprise CRM ecosystem. Aexy is for technical and product-led teams that want CRM, GTM, engineering work, docs, workflows, and governed AI agents in one open operating layer."
      aexyBestFor={[
        "Teams that want CRM connected to product, engineering, docs, and workflows.",
        "Companies that need an open-source/self-hostable path for core company context.",
        "Builders creating AI agents that need governed access across more than CRM.",
      ]}
      competitorBestFor={[
        "Large enterprises standardizing around Salesforce's CRM ecosystem.",
        "Teams with dedicated Salesforce admins and established enterprise processes.",
        "Organizations that rely on the Salesforce partner and app marketplace.",
      ]}
      rows={[
        ["Primary focus", "Open company OS with CRM, GTM, engineering, docs, workflows, people, and agents.", "Enterprise CRM platform and ecosystem."],
        ["Implementation path", "Start with one workflow, then expand across company context.", "Often requires admin, integration, and consulting-heavy rollout."],
        ["AI context", "Agents can work across CRM, docs, workflows, GTM, and engineering context with policies.", "AI primarily operates around Salesforce data and ecosystem workflows."],
        ["Control", "Open-source/self-hostable path.", "Commercial SaaS platform."],
      ]}
      migration={[
        "Identify the CRM workflow that currently depends on engineering, docs, or manual handoffs.",
        "Map core objects, ownership, activities, and GTM signals into Aexy.",
        "Use Aexy workflows and agents to automate routing, summaries, and cross-team execution.",
      ]}
    />
  );
}

import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/ComparisonPage";

export const metadata: Metadata = {
  title: "Aexy vs HubSpot",
  description: "Compare Aexy and HubSpot for teams that want CRM, GTM intelligence, engineering context, workflows, docs, and AI agents in one open company OS.",
};

export default function HubSpotComparisonPage() {
  return (
    <ComparisonPage
      competitor="HubSpot"
      eyebrow="Aexy vs HubSpot"
      title="A HubSpot alternative for technical teams that need CRM connected to execution."
      description="HubSpot is a mature CRM and marketing platform. Aexy is for teams that want CRM and GTM data connected to engineering work, docs, workflows, people operations, and governed AI agents."
      aexyBestFor={[
        "Technical/product-led teams that need CRM connected to delivery and operations.",
        "Teams that want open-source/self-hostable control over CRM and workflow context.",
        "Teams building AI agents that need access to more than sales data.",
      ]}
      competitorBestFor={[
        "Marketing and sales teams standardizing around HubSpot's CRM and marketing suite.",
        "Teams that want mature marketing automation and a large app ecosystem.",
        "Organizations already invested in HubSpot reporting and processes.",
      ]}
      rows={[
        ["Primary focus", "Company OS with CRM, GTM, engineering, docs, workflows, people, and agents.", "CRM, marketing, sales, and service suite."],
        ["Engineering context", "Tasks, sprints, tickets, docs, and developer insights can connect to customer records.", "Usually handled in separate engineering tools."],
        ["Agent governance", "Policy gates, approvals, tool access, and audit history for AI agents.", "AI features are mostly within HubSpot's CRM/marketing surface."],
        ["Control", "Open-source and self-hostable path.", "Commercial SaaS platform."],
      ]}
      migration={[
        "Start with a customer or GTM workflow that needs engineering or workflow context.",
        "Import core objects and map custom fields into Aexy's CRM model.",
        "Use Aexy automations and agents for handoffs, enrichment, summaries, and routing.",
      ]}
    />
  );
}

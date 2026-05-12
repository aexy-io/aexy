import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/ComparisonPage";

export const metadata: Metadata = {
  title: "Aexy vs Linear",
  description: "Compare Aexy and Linear for teams that want fast project planning connected to CRM, GTM, people, docs, workflows, and AI agents.",
};

export default function LinearComparisonPage() {
  return (
    <ComparisonPage
      competitor="Linear"
      eyebrow="Aexy vs Linear"
      title="A Linear alternative when product work must connect to the rest of the company."
      description="Linear is fast and focused for product issue tracking. Aexy keeps that work connected to CRM, GTM, people operations, docs, workflows, and AI agents."
      aexyBestFor={[
        "Technical teams that need product delivery connected to customer and revenue context.",
        "Teams building workflows across engineering, GTM, and operations.",
        "Teams that want open-source control and a broader company OS.",
      ]}
      competitorBestFor={[
        "Product teams that want a very focused issue tracker.",
        "Startups that prefer minimal process and fast keyboard-first planning.",
        "Teams that already have separate CRM, docs, HR, and workflow systems.",
      ]}
      rows={[
        ["Scope", "Company OS for work, customers, people, knowledge, workflows, and agents.", "Focused product planning and issue tracking."],
        ["GTM connection", "Built-in CRM, visitor identification, lead scoring, routing, and sequences.", "Requires separate GTM/CRM tools."],
        ["AI workflow", "Agents can operate across company modules through policies and audit logs.", "AI context is narrower around product work."],
        ["Extensibility", "Open-source/self-hosting path with broad module surface.", "SaaS-first workflow product."],
      ]}
      migration={[
        "Start by syncing or recreating the project/sprint workflow that needs broader context.",
        "Connect customer, deal, and GTM records to engineering work in Aexy.",
        "Move cross-functional workflows from integration glue into Aexy automations and agents.",
      ]}
    />
  );
}

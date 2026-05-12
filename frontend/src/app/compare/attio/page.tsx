import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/ComparisonPage";

export const metadata: Metadata = {
  title: "Aexy vs Attio",
  description: "Compare Aexy and Attio for teams that want flexible CRM plus GTM intelligence, engineering context, workflows, docs, and AI agents.",
};

export default function AttioComparisonPage() {
  return (
    <ComparisonPage
      competitor="Attio"
      eyebrow="Aexy vs Attio"
      title="An Attio alternative when CRM needs the full company context."
      description="Attio is a modern CRM built around flexible records. Aexy is for teams that want CRM connected to GTM intelligence, engineering execution, docs, workflows, people systems, and governed AI agents."
      aexyBestFor={[
        "Teams that need CRM plus project, docs, GTM, workflow, and agent context.",
        "Technical teams that want open-source/self-hostable control over the operating layer.",
        "Companies using AI agents for CRM and cross-functional workflows.",
      ]}
      competitorBestFor={[
        "Teams that mainly need a flexible, modern CRM workspace.",
        "Revenue teams that do not need engineering or operations modules in the same system.",
        "Organizations comfortable with a focused commercial CRM.",
      ]}
      rows={[
        ["Primary focus", "Company OS with CRM as one connected module.", "Flexible CRM workspace."],
        ["Cross-functional work", "CRM records can connect to tickets, docs, GTM workflows, reviews, and agents.", "Most non-CRM work remains in separate tools."],
        ["Agent governance", "Policy gates, approvals, tool access, and audit history across modules.", "AI workflows are scoped around the CRM product surface."],
        ["Control", "Open-source/self-hostable path.", "Commercial SaaS CRM."],
      ]}
      migration={[
        "Start with CRM objects and relationship data that need wider company context.",
        "Connect GTM signals, docs, and project handoffs to those records.",
        "Add agents for summaries, enrichment, routing, and approval-based CRM updates.",
      ]}
    />
  );
}

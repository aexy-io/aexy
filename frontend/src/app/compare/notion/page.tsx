import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/ComparisonPage";

export const metadata: Metadata = {
  title: "Aexy vs Notion",
  description: "Compare Aexy and Notion for teams that need docs connected to CRM, GTM, engineering work, workflows, and governed AI agents.",
};

export default function NotionComparisonPage() {
  return (
    <ComparisonPage
      competitor="Notion"
      eyebrow="Aexy vs Notion"
      title="A Notion alternative when docs need to become operational."
      description="Notion is excellent for flexible docs and team knowledge. Aexy adds the operating layer: CRM, GTM, tasks, workflows, AI metadata, MCP tools, and governed agents."
      aexyBestFor={[
        "Teams that want docs connected to CRM, tasks, workflows, and agents.",
        "Companies that need operational records and audit trails, not only flexible pages.",
        "Technical teams that want open-source control and API-driven modules.",
      ]}
      competitorBestFor={[
        "Teams that mainly need flexible docs, wikis, and lightweight databases.",
        "Creators and teams that prioritize easy page building.",
        "Organizations already using Notion as a knowledge hub.",
      ]}
      rows={[
        ["Core model", "Company OS with docs connected to records, workflows, GTM, engineering, and agents.", "Flexible docs, wikis, and databases."],
        ["Operational workflows", "Automations, tickets, CRM, GTM routing, reminders, and agent actions are built in.", "Often requires external tools and integrations."],
        ["AI context", "Agents can use company modules and governed tools.", "AI is centered on workspace content and docs."],
        ["Knowledge graph", "Docs, Drive, metadata, embeddings, MCP, and operational records can connect.", "Knowledge is primarily document/database based."],
      ]}
      migration={[
        "Start with operational docs that currently trigger manual follow-up.",
        "Move records, files, and workflows that need structured ownership into Aexy.",
        "Use Aexy agents and automations to turn knowledge into actions and handoffs.",
      ]}
    />
  );
}

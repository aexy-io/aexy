import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/ComparisonPage";

export const metadata: Metadata = {
  // `absolute` because the title already carries the brand; the root
  // layout's "%s | Aexy" template would otherwise render it twice.
  title: { absolute: "Aexy vs Jira" },
  description: "Compare Aexy and Jira for teams that want sprint planning, CRM, docs, workflows, GTM intelligence, and AI agents in one company OS.",
  alternates: { canonical: "/compare/jira" },
};

export default function JiraComparisonPage() {
  return (
    <ComparisonPage
      path="/compare/jira"
      competitor="Jira"
      eyebrow="Aexy vs Jira"
      title="A Jira alternative for teams that need more than issue tracking."
      description="Jira is strong for software issue tracking. Aexy is built for teams that want engineering work connected to CRM, GTM, docs, people, workflows, and governed AI agents."
      aexyBestFor={[
        "Teams that want engineering, customer, and company workflows in one operating layer.",
        "Leaders who need sprint planning plus CRM/GTM context and AI agents.",
        "Open-source and self-hosting oriented teams.",
      ]}
      competitorBestFor={[
        "Teams standardized on Atlassian workflows.",
        "Large organizations with complex issue-management processes.",
        "Teams that only need mature ticketing and agile ceremonies.",
      ]}
      rows={[
        ["Core model", "Company OS spanning engineering, CRM, GTM, docs, workflows, people, and agents.", "Issue and project tracking for software teams."],
        ["Git awareness", "Commits and PRs auto-link to tasks (“fixes #123”), with AI analysis of how well each PR matches its task.", "Commit linking via GitHub/Bitbucket apps; no AI alignment analysis."],
        ["Incident automation", "Uptime monitors and observability alerts auto-create tickets, dedupe recurring alerts, and auto-resolve on recovery.", "Requires Jira Service Management or separate incident tooling."],
        ["AI agents", "Governed agents can use CRM, email, docs, workflows, and company context.", "AI features depend on Atlassian ecosystem and issue context."],
        ["Customer context", "CRM, GTM intelligence, visitor identification, sequences, and routing are built in.", "Usually requires separate CRM and integration work."],
        ["Open source", "Open-source core and self-hosting path.", "Commercial SaaS/on-prem enterprise product."],
      ]}
      migration={[
        "Import or connect engineering tasks while keeping Jira as the initial source of truth.",
        "Move sprint planning, docs, reviews, or GTM handoffs into Aexy module by module.",
        "Use automations and agents to connect engineering work to customer and revenue workflows.",
      ]}
    />
  );
}

import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "Aexy for Operations Teams",
  description: "Aexy helps operations teams connect docs, forms, workflows, reminders, CRM, people processes, compliance, and AI agents in one company OS.",
};

export default function OperationsPage() {
  return (
    <SeoLandingPage
      eyebrow="For operations"
      title="Turn repeated company work into governed workflows."
      description="Aexy helps operations teams centralize process, ownership, forms, docs, reminders, compliance, CRM context, and agent-assisted workflows."
      proofPoints={["Replace scattered spreadsheets and manual reminders.", "Connect forms, docs, owners, and workflow history.", "Give agents clear boundaries for repetitive work."]}
      sections={[
        { title: "Process control", body: "Define repeatable workflows with owners and clear status.", items: ["Forms", "Approvals", "Reminders"] },
        { title: "Company context", body: "Keep operational work linked to customers, people, docs, and projects.", items: ["Docs", "CRM records", "People workflows"] },
        { title: "Agent support", body: "Use agents to summarize, route, and prepare actions while preserving auditability.", items: ["Summaries", "Routing", "Audit logs"] },
      ]}
      faqs={[
        ["What operations work can Aexy handle?", "Forms, approvals, reminders, documentation, compliance workflows, CRM updates, and cross-team handoffs."],
        ["Can operations teams use Aexy without replacing everything?", "Yes. Start with one recurring workflow and connect more systems over time."],
        ["Does Aexy support governed AI workflows?", "Yes. Agents can be controlled with tool permissions, policies, approvals, and audit history."],
      ]}
      relatedLinks={[["Open-source company OS", "/open-source-company-os"], ["Company knowledge graph", "/use-cases/company-knowledge-graph"], ["AI agents", "/products/ai-agents"], ["Pricing", "/pricing"]]}
      schema={{ "@context": "https://schema.org", "@type": "WebPage", name: "Aexy for Operations" }}
    />
  );
}

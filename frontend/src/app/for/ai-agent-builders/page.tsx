import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "Aexy for AI Agent Builders",
  description: "Aexy gives AI agent builders a governed company context layer with CRM, GTM, docs, workflows, approved tools, policies, and audit history.",
};

export default function AiAgentBuildersPage() {
  return (
    <SeoLandingPage
      eyebrow="For AI agent builders"
      title="Build agents on top of real company context."
      description="Aexy gives agent builders a practical operating layer for tool access, CRM records, docs, workflows, policies, approvals, and audit history."
      proofPoints={["Company context across CRM, docs, GTM, tickets, and workflows.", "Tool access with policies, approvals, and audit history.", "Open-source/self-hostable path for teams that want extensibility."]}
      sections={[
        { title: "Useful context", body: "Agents need more than prompts. Aexy connects the operational data agents need to act.", items: ["CRM", "Docs", "Workflow state"] },
        { title: "Governed tools", body: "Expose tools deliberately instead of giving agents broad, opaque access.", items: ["Permissions", "Policy gates", "Approvals"] },
        { title: "Traceable execution", body: "Keep agent runs explainable and reviewable.", items: ["Tool calls", "Decisions", "Outputs"] },
      ]}
      faqs={[
        ["Can Aexy support custom agents?", "Aexy is built around workflows, tools, and company context that can support custom agent patterns."],
        ["Why not build agents directly on top of each SaaS tool?", "A shared company context layer reduces duplicated integrations and gives agents a clearer governance model."],
        ["Can agents access CRM and docs?", "Yes, subject to configured tools, permissions, and policies."],
      ]}
      relatedLinks={[["AI agents", "/products/ai-agents"], ["Agent-native CRM", "/agent-native-crm"], ["Company knowledge graph", "/use-cases/company-knowledge-graph"], ["Open-source company OS", "/open-source-company-os"]]}
      schema={{ "@context": "https://schema.org", "@type": "WebPage", name: "Aexy for AI Agent Builders" }}
    />
  );
}

import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "AI Agents for CRM",
  description: "Use Aexy AI agents for CRM workflows including lead routing, enrichment, account summaries, email drafts, approvals, and audit history.",
};

export default function AiAgentsForCrmPage() {
  return (
    <SeoLandingPage
      eyebrow="Use case"
      title="Use AI agents for CRM work without losing governance."
      description="Aexy gives agents the CRM, email, GTM, workflow, and company context they need while keeping tool access, approvals, and audit trails close to every action."
      proofPoints={[
        "Agents can enrich, summarize, route, and draft from CRM context.",
        "Sensitive actions can require human approval before execution.",
        "Every tool call and workflow decision can be reviewed.",
      ]}
      sections={[
        { title: "Lead triage", body: "Classify new leads and replies using CRM history and intent signals.", items: ["ICP scoring", "Owner routing", "Reply classification"] },
        { title: "CRM hygiene", body: "Reduce manual updates by letting agents prepare record changes and summaries.", items: ["Field updates", "Account summaries", "Activity logging"] },
        { title: "Controlled execution", body: "Keep humans in the loop for messages, field changes, and workflows that need approval.", items: ["Policy gates", "Approval queues", "Audit history"] },
      ]}
      faqs={[
        ["Can agents update CRM fields?", "Yes, when the workspace grants the right tools and policies allow the action."],
        ["Can agents draft emails?", "Yes. Agents can draft contextual replies and hand them to a human or workflow for review."],
        ["Is this only for sales teams?", "No. The CRM can connect to customer success, product, engineering, operations, and founder workflows."],
      ]}
      relatedLinks={[["Agent-native CRM", "/agent-native-crm"], ["CRM product", "/products/crm"], ["AI agents", "/products/ai-agents"], ["HubSpot comparison", "/compare/hubspot"]]}
      schema={{ "@context": "https://schema.org", "@type": "WebPage", name: "AI Agents for CRM" }}
    />
  );
}

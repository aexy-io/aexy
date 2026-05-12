import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "Open Source Company OS",
  description: "Aexy is an open-source, self-hostable company OS for teams that want CRM, GTM, engineering, docs, workflows, and AI agents in one governed workspace.",
};

const faqs: Array<[string, string]> = [
  ["What is an open-source company OS?", "It is a shared operating layer for company work where the code can be inspected, self-hosted, extended, and connected to your own systems."],
  ["Can Aexy be self-hosted?", "Yes. Aexy is designed with an open-source path so teams can evaluate, audit, fork, and run the platform with more control."],
  ["Is Aexy only for engineering teams?", "No. Engineering is a strong wedge, but Aexy also covers CRM, GTM, docs, workflows, people, and AI agents."],
];

export default function OpenSourceCompanyOsPage() {
  return (
    <SeoLandingPage
      eyebrow="Open-source company OS"
      title="Run company work on an inspectable operating layer."
      description="Aexy gives technical teams a self-hostable company OS that connects execution, customers, knowledge, workflows, and governed AI agents without forcing every team into a closed SaaS stack."
      proofPoints={[
        "Open-source path for teams that need auditability and control.",
        "Self-hostable architecture for companies that want data ownership.",
        "Built around real modules: CRM, GTM, docs, planning, tickets, workflows, and agents.",
      ]}
      sections={[
        {
          title: "Own the operating layer",
          body: "Aexy is built for companies that want their work graph, customer records, docs, and agent context to stay portable.",
          items: ["Audit the code", "Self-host critical workflows", "Export company data"],
        },
        {
          title: "Connect the stack",
          body: "Use one context layer for work that normally gets split across tickets, CRM, docs, forms, email, and spreadsheets.",
          items: ["Engineering execution", "CRM and GTM workflows", "Docs and knowledge graph"],
        },
        {
          title: "Govern AI agents",
          body: "Agents need context, but they also need limits. Aexy keeps tool access, approvals, and audit history close to the work.",
          items: ["Policy gates", "Approved tools", "Execution history"],
        },
      ]}
      faqs={faqs}
      relatedLinks={[
        ["AI company OS", "/ai-company-os"],
        ["AI agents", "/products/ai-agents"],
        ["Agent-native CRM", "/agent-native-crm"],
        ["Pricing", "/pricing"],
      ]}
      schema={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Aexy",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: "Open-source, self-hostable company operating system for CRM, GTM, engineering, docs, workflows, and AI agents.",
      }}
    />
  );
}

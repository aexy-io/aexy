import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "Open Source CRM and Project Management",
  description: "Aexy combines open-source CRM and project management with docs, GTM intelligence, workflows, and governed AI agents.",
};

export default function OpenSourceCrmAndProjectManagementPage() {
  return (
    <SeoLandingPage
      eyebrow="Use case"
      title="Open-source CRM and project management in one company OS."
      description="Aexy connects customer records to planning, tickets, docs, forms, workflows, and agents so technical teams can manage both relationships and execution in one place."
      proofPoints={[
        "CRM records can connect to tickets, epics, docs, and workflows.",
        "Open-source/self-hostable path for teams that need more control.",
        "AI agents can operate across CRM and project context with governance.",
      ]}
      sections={[
        { title: "CRM plus delivery", body: "Bridge the gap between customer needs and actual execution.", items: ["Companies and contacts", "Tickets and epics", "Customer-linked docs"] },
        { title: "Workflow automation", body: "Automate updates and routing across sales, support, product, and engineering.", items: ["Status sync", "Owner tasks", "Approval flows"] },
        { title: "Agent assistance", body: "Let agents summarize, enrich, and draft with access to both customer and project context.", items: ["Account summaries", "Deal risk notes", "Project updates"] },
      ]}
      faqs={[
        ["Is Aexy a CRM or project management tool?", "It includes both, but its broader purpose is to connect company work into one operating layer."],
        ["Can it replace separate CRM and ticketing tools?", "It can for many teams, especially when CRM and delivery workflows are tightly linked."],
        ["Is the platform open source?", "Aexy has an open-source path for teams that want to evaluate, audit, and self-host."],
      ]}
      relatedLinks={[["CRM product", "/products/crm"], ["Planning product", "/products/planning"], ["Tickets product", "/products/tickets"], ["Open-source company OS", "/open-source-company-os"]]}
      schema={{ "@context": "https://schema.org", "@type": "WebPage", name: "Open Source CRM and Project Management" }}
    />
  );
}

import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/ComparisonPage";

export const metadata: Metadata = {
  title: "Aexy vs ServiceNow",
  description: "Compare Aexy and ServiceNow for teams evaluating governed AI agents, enterprise workflows, company OS platforms, CRM, GTM, docs, and engineering operations.",
};

export default function ServiceNowComparisonPage() {
  return (
    <ComparisonPage
      competitor="ServiceNow"
      eyebrow="Aexy vs ServiceNow"
      title="A ServiceNow alternative for teams that want open, product-led company operations."
      description="ServiceNow validates the enterprise need for governed workflows and agents across business functions. Aexy is a lighter, open company OS for technical teams that want CRM, GTM, engineering, docs, workflows, and agents without starting from an enterprise service-management rollout."
      aexyBestFor={[
        "Startups, scaleups, and technical teams that need a lighter open company OS.",
        "Teams that want CRM, GTM, engineering, docs, and agents connected without enterprise platform overhead.",
        "Companies that value self-hostable control and product-led adoption.",
      ]}
      competitorBestFor={[
        "Large enterprises standardizing ITSM, service management, and enterprise workflows.",
        "Organizations with mature procurement, admin, implementation, and governance teams.",
        "Companies that need a large enterprise platform ecosystem.",
      ]}
      rows={[
        ["Primary focus", "Open AI company OS for technical/product-led teams.", "Enterprise workflow, service management, and business automation platform."],
        ["Adoption motion", "Product-led, module-by-module adoption.", "Enterprise rollout with governance and implementation planning."],
        ["Agent governance", "Policies, approvals, tool access, and audit history inside company workflows.", "Enterprise agent and workflow governance across large departments."],
        ["Best fit", "Teams that want speed, openness, and connected operating context.", "Large enterprises with broad service-management requirements."],
      ]}
      migration={[
        "Start with the operational workflow that needs governance but is too small for enterprise platform rollout.",
        "Connect CRM, docs, tickets, and workflows in Aexy.",
        "Add agents once tool access, approvals, and audit trails are defined.",
      ]}
      faqs={[
        ["Is Aexy an enterprise service-management platform?", "No. Aexy is an AI company OS for technical teams. It covers workflows and governance, but it is not trying to be a full ServiceNow-style enterprise platform."],
        ["When is ServiceNow a better choice?", "ServiceNow is better suited to large enterprises with deep service-management, procurement, and governance requirements."],
        ["Why compare Aexy with ServiceNow?", "ServiceNow validates the need for governed agents and workflow context; Aexy offers a lighter, open, product-led path for technical teams."],
      ]}
    />
  );
}

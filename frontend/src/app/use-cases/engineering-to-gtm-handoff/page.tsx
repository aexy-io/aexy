import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "Engineering to GTM Handoff",
  description: "Connect engineering, product, CRM, and GTM workflows with Aexy so customer commitments, releases, bugs, and expansion signals do not get lost.",
};

export default function EngineeringToGtmHandoffPage() {
  return (
    <SeoLandingPage
      eyebrow="Use case"
      title="Connect engineering work to GTM follow-through."
      description="Aexy links tickets, releases, customer records, docs, workflows, and account signals so product-led teams can route customer requests, launch updates, and expansion opportunities with context."
      proofPoints={[
        "Connect customer records to tickets, docs, and project work.",
        "Route launch, bug, and feature signals to the right owner.",
        "Use agents to summarize customer impact and suggest follow-up.",
      ]}
      sections={[
        { title: "Customer commitments", body: "Keep feature requests and support escalations connected to records and ownership.", items: ["CRM-linked tickets", "Account timelines", "Status updates"] },
        { title: "Release follow-up", body: "Turn shipped work into GTM motion without manual coordination.", items: ["Launch checklists", "Customer alerts", "Docs updates"] },
        { title: "Expansion signals", body: "Help revenue teams see product usage, account health, and engineering state in one flow.", items: ["Health workflows", "Owner tasks", "Agent summaries"] },
      ]}
      faqs={[
        ["Who is this for?", "Product-led teams where engineering work directly affects sales, customer success, expansion, or support."],
        ["Does this require replacing Jira or Linear immediately?", "No. Aexy can start as the connecting workflow layer and gradually absorb work where it makes sense."],
        ["Can agents help with handoffs?", "Yes. Agents can summarize context, draft updates, create tasks, and route work under configured policies."],
      ]}
      relatedLinks={[["GTM intelligence", "/products/gtm-intelligence"], ["CRM product", "/products/crm"], ["Planning product", "/products/planning"], ["Linear comparison", "/compare/linear"]]}
      schema={{ "@context": "https://schema.org", "@type": "WebPage", name: "Engineering to GTM Handoff" }}
    />
  );
}

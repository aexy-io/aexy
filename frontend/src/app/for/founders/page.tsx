import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "Aexy for Founders",
  description: "Aexy helps founders run CRM, GTM, product, engineering, docs, hiring, workflows, and AI agents in one open company OS.",
};

export default function FoundersPage() {
  return (
    <SeoLandingPage
      eyebrow="For founders"
      title="Run the company from one operating layer."
      description="Aexy gives founders one place to connect customers, product work, GTM signals, docs, hiring, workflows, and AI agents before the stack fragments."
      proofPoints={["See customers, work, and ownership together.", "Start open source and add cloud/enterprise when needed.", "Use agents for summaries, routing, and workflow support."]}
      sections={[
        { title: "Founder visibility", body: "Keep the operating picture close without building a dashboard graveyard.", items: ["CRM and pipeline", "Product work", "Team workflows"] },
        { title: "Lean execution", body: "Run more with fewer disconnected tools and fewer manual handoffs.", items: ["Docs", "Forms", "Automations"] },
        { title: "Controlled AI", body: "Use agents where context and governance matter.", items: ["Approvals", "Tool access", "Audit history"] },
      ]}
      faqs={[
        ["Is Aexy useful before hiring a full ops team?", "Yes. It is designed to centralize work early and prevent expensive stack fragmentation."],
        ["Can founders self-host?", "Yes. The open-source path is useful for technical founders that want control and transparency."],
        ["What should founders adopt first?", "Start with CRM, docs, planning, or GTM workflows depending on the biggest current coordination problem."],
      ]}
      relatedLinks={[["AI company OS", "/ai-company-os"], ["Replace SaaS sprawl", "/use-cases/replace-saas-sprawl"], ["Pricing", "/pricing"], ["Contact", "/contact"]]}
      schema={{ "@context": "https://schema.org", "@type": "WebPage", name: "Aexy for Founders" }}
    />
  );
}

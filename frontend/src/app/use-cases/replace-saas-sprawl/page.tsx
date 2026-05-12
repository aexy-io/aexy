import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "Replace SaaS Sprawl",
  description: "Use Aexy to reduce SaaS sprawl by connecting CRM, GTM, planning, tickets, docs, workflows, people, and AI agents in one open company OS.",
};

export default function ReplaceSaasSprawlPage() {
  return (
    <SeoLandingPage
      eyebrow="Use case"
      title="Replace SaaS sprawl with one company context layer."
      description="Aexy helps teams consolidate the work graph across customers, projects, docs, workflows, people, and AI agents without pretending every specialized tool disappears on day one."
      proofPoints={[
        "Start with the workflow that hurts most, then expand module by module.",
        "Keep open-source/self-hostable control over core company context.",
        "Connect CRM, GTM, engineering, docs, forms, reviews, and agents.",
      ]}
      sections={[
        { title: "Consolidate context", body: "Reduce duplicate records and disconnected handoffs across teams.", items: ["Customer records", "Projects and tickets", "Docs and forms"] },
        { title: "Automate handoffs", body: "Turn cross-tool handoffs into governed workflows and agent-assisted actions.", items: ["Owner routing", "Status updates", "Approval gates"] },
        { title: "Migrate gradually", body: "Replace brittle workflow surfaces first while keeping integrations where they still matter.", items: ["Import current data", "Map critical processes", "Expand by team"] },
      ]}
      faqs={[
        ["Does Aexy replace every SaaS tool?", "No. Aexy can replace or connect major workflow surfaces, but the practical path is to migrate high-friction workflows first."],
        ["Which teams benefit first?", "Founder-led, technical, product-led, and operations-heavy teams usually benefit fastest because their work crosses many tools."],
        ["Can Aexy connect to existing systems?", "Aexy is designed around integrations and workflows so teams can connect existing systems while moving core context into one operating layer."],
      ]}
      relatedLinks={[["AI company OS", "/ai-company-os"], ["Open-source company OS", "/open-source-company-os"], ["Pricing", "/pricing"], ["Jira comparison", "/compare/jira"]]}
      schema={{ "@context": "https://schema.org", "@type": "WebPage", name: "Replace SaaS Sprawl with Aexy" }}
    />
  );
}

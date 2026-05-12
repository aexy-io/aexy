import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  title: "Company Knowledge Graph",
  description: "Build a company knowledge graph in Aexy by connecting docs, CRM records, tickets, workflows, people, files, and AI agents.",
};

export default function CompanyKnowledgeGraphPage() {
  return (
    <SeoLandingPage
      eyebrow="Use case"
      title="Build a company knowledge graph agents can actually use."
      description="Aexy connects docs, files, CRM records, projects, workflows, people, and activities so AI agents and humans can find the context behind company decisions."
      proofPoints={[
        "Connect docs, files, CRM, tickets, forms, and workflow history.",
        "Give agents governed access to the knowledge behind company work.",
        "Turn scattered context into searchable, linked operating memory.",
      ]}
      sections={[
        { title: "Linked knowledge", body: "Keep docs connected to the work, customers, and decisions they describe.", items: ["Docs and files", "Records and tickets", "People and ownership"] },
        { title: "Agent context", body: "Help agents answer with the right company context instead of isolated snippets.", items: ["Approved retrieval", "Source-aware summaries", "Workflow memory"] },
        { title: "Operational memory", body: "Capture what happened, who owned it, and how work moved across teams.", items: ["Activity history", "Decision context", "Reusable workflows"] },
      ]}
      faqs={[
        ["What is a company knowledge graph?", "It is a connected map of company entities such as people, docs, customers, projects, files, workflows, and activities."],
        ["Why does this matter for AI agents?", "Agents perform better when they can retrieve governed context about the company, not just generic documents."],
        ["Does Aexy include docs?", "Yes. Aexy includes documentation and knowledge workflows that connect to the rest of the company OS."],
      ]}
      relatedLinks={[["Docs product", "/products/docs"], ["Handbook", "/handbook"], ["AI agents", "/products/ai-agents"], ["Notion comparison", "/compare/notion"]]}
      schema={{ "@context": "https://schema.org", "@type": "WebPage", name: "Company Knowledge Graph" }}
    />
  );
}

import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/ComparisonPage";

export const metadata: Metadata = {
  title: "Aexy vs Bosys",
  description: "Compare Aexy and Bosys for teams evaluating AI business operating systems, generated workflows, open company OS platforms, and governed AI agents.",
};

export default function BosysComparisonPage() {
  return (
    <ComparisonPage
      competitor="Bosys"
      eyebrow="Aexy vs Bosys"
      title="A Bosys alternative for teams that want an inspectable company OS."
      description="Bosys-style products focus on building or configuring a business OS from a description. Aexy is for teams that want a real, inspectable operating system with CRM, GTM, engineering, docs, workflows, people processes, and governed agents already connected."
      aexyBestFor={[
        "Teams that want operational depth across concrete modules, not only generated structure.",
        "Technical companies that value open-source/self-hostable control and product proof.",
        "Teams building governed agents on top of real company context.",
      ]}
      competitorBestFor={[
        "Companies attracted to describing a business process and getting an AI-generated operating setup.",
        "SMB teams that prefer a simpler generated-system story.",
        "Buyers looking for broad workflow configuration before technical depth.",
      ]}
      rows={[
        ["Primary focus", "Inspectable company OS with real modules and governed agents.", "AI-generated or AI-configured business operating system concept."],
        ["Operational depth", "CRM, GTM, engineering, docs, workflows, people, and agent context are connected.", "Depth depends on configured/generated workflows."],
        ["Trust wedge", "Open-source/self-hostable path, docs, integrations, policies, and audit trails.", "Emphasis is usually on fast setup and AI creation."],
        ["Best fit", "Technical teams that need durable operating context.", "Teams that want a lightweight generated business system."],
      ]}
      migration={[
        "Start by mapping the operating workflows that need durable records and ownership.",
        "Move the first workflow into Aexy's connected modules.",
        "Use governed agents to assist with routing, summaries, and updates once data is structured.",
      ]}
      faqs={[
        ["Does Aexy generate a company OS from a prompt?", "Aexy focuses on concrete operating modules and agent-assisted workflows rather than relying only on generated structure."],
        ["When is Bosys-style tooling attractive?", "It can be attractive when speed of setup and generated process scaffolding are the main priorities."],
        ["Why choose Aexy?", "Choose Aexy when open-source control, real modules, integrations, docs, and governed agents matter more than a generated-business-system promise."],
      ]}
    />
  );
}

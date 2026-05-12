import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/ComparisonPage";

export const metadata: Metadata = {
  title: "Aexy vs Relaticle",
  description: "Compare Aexy and Relaticle for teams evaluating open-source CRM, AI agents, GTM workflows, engineering context, docs, and company OS platforms.",
};

export default function RelaticleComparisonPage() {
  return (
    <ComparisonPage
      competitor="Relaticle"
      eyebrow="Aexy vs Relaticle"
      title="A Relaticle alternative when agent-native CRM needs the full company OS."
      description="Relaticle is positioned around open-source CRM for AI agents. Aexy is for teams that want agent-native CRM connected to GTM intelligence, engineering execution, docs, people workflows, and governed agents in one operating layer."
      aexyBestFor={[
        "Teams that need CRM plus GTM, engineering, docs, workflows, and people context.",
        "Companies that want agents to operate across more than customer records.",
        "Technical teams consolidating workflow context into an open company OS.",
      ]}
      competitorBestFor={[
        "Teams primarily evaluating an open-source CRM built around AI agents.",
        "CRM-first teams that do not need engineering and company-OS modules in the same product.",
        "Builders focused on customer-record workflows before broader operations.",
      ]}
      rows={[
        ["Primary focus", "AI company OS with CRM, GTM, engineering, docs, workflows, people, and agents.", "Open-source CRM centered on AI-agent workflows."],
        ["CRM depth", "CRM is connected to GTM signals, docs, tickets, workflows, and account handoffs.", "CRM is the primary product surface."],
        ["Agent context", "Agents can use company-wide context across modules with policies and audit history.", "Agents are strongest around CRM workflows."],
        ["Best migration wedge", "Start with CRM handoffs that depend on engineering, GTM, docs, or operations.", "Start with CRM workflows that need agent assistance."],
      ]}
      migration={[
        "Map the CRM workflows where customer context touches delivery, docs, or GTM routing.",
        "Move core objects and activities into Aexy's CRM model.",
        "Add Aexy agents for enrichment, summaries, routing, and approval-based updates across modules.",
      ]}
      faqs={[
        ["Is Aexy a CRM like Relaticle?", "Aexy includes CRM, but it is broader: CRM connects to GTM intelligence, engineering, docs, workflows, people, and AI agents."],
        ["When is Relaticle a better fit?", "Relaticle may be a better fit when the evaluation is specifically CRM-first and broader company OS modules are not required."],
        ["Why compare Aexy with Relaticle?", "Both speak to open-source and agent-native CRM demand, but Aexy positions the CRM as one part of a wider company operating system."],
      ]}
    />
  );
}

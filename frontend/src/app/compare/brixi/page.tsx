import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/ComparisonPage";

export const metadata: Metadata = {
  title: "Aexy vs Brixi",
  description: "Compare Aexy and Brixi for teams evaluating AI operating layers, CRM, inbox, workflow automation, GTM intelligence, docs, and company OS platforms.",
};

export default function BrixiComparisonPage() {
  return (
    <ComparisonPage
      competitor="Brixi"
      eyebrow="Aexy vs Brixi"
      title="A Brixi alternative when revenue workflows need company-wide context."
      description="Brixi-style positioning emphasizes revenue conversations, CRM, inbox, and workflow capture. Aexy is for teams that want those GTM workflows connected to engineering execution, docs, people systems, and governed AI agents."
      aexyBestFor={[
        "Revenue teams that need CRM and inbox work connected to product and engineering.",
        "Technical companies where customer promises become tickets, docs, releases, and workflows.",
        "Teams that want GTM intelligence as part of an open company OS.",
      ]}
      competitorBestFor={[
        "Revenue teams focused on conversations, inboxes, CRM capture, and follow-up workflows.",
        "Companies that want a focused GTM operating layer before broader company operations.",
        "Teams optimizing lead response and sales workflow capture.",
      ]}
      rows={[
        ["Primary focus", "Company OS connecting GTM, CRM, engineering, docs, workflows, people, and agents.", "Revenue operating layer around conversations, CRM, inbox, and workflow capture."],
        ["GTM context", "Visitor, account, CRM, workflow, and engineering context can be connected.", "Strongest around revenue-team workflow surfaces."],
        ["Engineering handoff", "Tickets, projects, docs, and releases can connect to customer records.", "Usually handled outside the revenue tool."],
        ["Control", "Open-source/self-hostable path.", "Commercial GTM/revenue platform model."],
      ]}
      migration={[
        "Identify GTM workflows where customer context depends on engineering or product follow-through.",
        "Connect CRM records, GTM signals, docs, and ticket handoffs in Aexy.",
        "Add agents for account summaries, follow-up drafts, routing, and release/customer updates.",
      ]}
      faqs={[
        ["Is Aexy a revenue tool?", "Aexy includes GTM intelligence and CRM, but its core value is connecting revenue work to the rest of company operations."],
        ["When is Brixi-style tooling a better fit?", "It can be better when the primary need is focused revenue conversation capture and inbox-driven workflows."],
        ["Why compare Aexy with Brixi?", "Both address GTM workflow automation, but Aexy extends the operating layer into engineering, docs, people, and governed agents."],
      ]}
    />
  );
}

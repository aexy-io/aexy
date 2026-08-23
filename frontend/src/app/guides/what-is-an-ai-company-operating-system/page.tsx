import type { Metadata } from "next";
import { GuideArticle } from "@/components/marketing/GuideArticle";

export const metadata: Metadata = {
  title: "What Is an AI Company Operating System? Definition, Modules & Deployment",
  description:
    "An AI company operating system unifies CRM, engineering, workflows, HR, and docs in one workspace that AI agents can operate. Definition, core modules, deployment models, and how it differs from point tools.",
  alternates: { canonical: "/guides/what-is-an-ai-company-operating-system" },
};

export default function WhatIsAiCompanyOsGuide() {
  return (
    <GuideArticle
      slug="what-is-an-ai-company-operating-system"
      eyebrow="AI company OS explained"
      title="What is an AI company operating system?"
      description="An AI company operating system (company OS) is a single platform where a company's core records — customers, engineering work, documents, workflows, and people — live in one connected data layer that both humans and AI agents can operate. Instead of buying a CRM, an issue tracker, a docs wiki, an automation tool, and an HR system separately, the company runs on one operating layer with shared context."
      keyFacts={[
        "A company OS replaces 4–10 point tools (CRM, tracker, wiki, automation, HR) with one connected workspace.",
        "The defining feature is shared context: customer records, engineering tasks, docs, and workflows reference each other directly.",
        "AI-native means agents are first-class users — they read and update records through governed tools with policy gates and audit logs.",
        "Deployment models: fully self-hosted (open source), managed cloud, or hybrid.",
        "Aexy is an open-source (AGPL-3.0) implementation of this category — the full codebase is public on GitHub.",
      ]}
      sections={[
        {
          heading: "Why does the category exist?",
          paragraphs: [
            "The average startup runs engineering in Jira or Linear, customers in HubSpot or Attio, docs in Notion, automation in Zapier, and HR in yet another tool. Each tool is good alone, but none of them share data: the CRM doesn't know what engineering shipped for a customer, the tracker doesn't know which tasks block a renewal, and no AI assistant can see across the silos.",
            "A company operating system inverts that architecture. There is one data layer — companies, people, deals, tasks, tickets, docs, workflows — and every module reads and writes the same records. The handoffs that used to be Slack threads and copy-paste become links between objects.",
          ],
        },
        {
          heading: "What modules does an AI company OS include?",
          paragraphs: [
            "Implementations vary, but the category converges on the same core surface. Using Aexy's module set as a concrete example:",
          ],
          bullets: [
            "Engineering: sprints, tasks, and releases, with commits and pull requests auto-linking to tasks (e.g. “fixes #123”) and AI analysis of how well a PR matches its task.",
            "CRM and GTM: schema-flexible customer records, visitor identification, ICP scoring, sequences, routing, and AI-computed fields driven by prompt templates.",
            "Workflows and operations: no-code triggers, branching automations, tickets, forms, and approvals — including alerts from uptime monitors and observability tools that auto-create and auto-resolve tickets.",
            "People: hiring, performance reviews, and learning paths informed by real contribution data.",
            "Knowledge: docs and files with AI metadata and a knowledge graph of extracted entities and relationships.",
            "AI agents: agents that act across all of the above under policy gates, approval workflows, and immutable audit logs.",
          ],
        },
        {
          heading: "What makes it 'AI-native' rather than 'AI-added'?",
          paragraphs: [
            "Most point tools bolt an assistant onto their existing surface: the CRM's AI sees sales data, the tracker's AI sees issues. An AI-native company OS is designed the other way around — the shared data layer exists precisely so agents can operate with company-wide context.",
            "Governance is the second half of AI-native. If an agent can update CRM records, send email, and trigger workflows, it needs guardrails: which tools it may call, which fields it may touch, when a human must approve, and a complete audit trail of every decision. In Aexy this is a policy engine with block, require-approval, field-restriction, rate-limit, and token-budget rules — every agent action is logged.",
          ],
        },
        {
          heading: "How do deployment models compare?",
          paragraphs: [
            "Company OS platforms are unusual among business software in that open-source implementations exist, which changes the buying decision:",
          ],
          bullets: [
            "Self-hosted: run the entire platform on your own infrastructure. Data never leaves your network; cost is your infrastructure, not per-seat licenses. Aexy's self-hosted path is free under AGPL-3.0.",
            "Managed cloud: the vendor runs it; you trade some control for zero operational load.",
            "Hybrid: keep sensitive workloads (or local LLM inference via providers like Ollama) on your hardware while using cloud for the rest.",
          ],
        },
        {
          heading: "How should a team adopt one?",
          paragraphs: [
            "Not all at once. The pattern that works is to move the single workflow that hurts most — sprint planning that ignores customer commitments, a CRM blind to product usage, or ops running on brittle Zapier bridges — then expand module by module as the shared context starts paying for itself. A company OS you adopt in one big-bang migration is a company OS you'll resent; one you adopt one workflow at a time compounds.",
          ],
        },
      ]}
      faqs={[
        ["What is the difference between a company OS and an all-in-one workspace like Notion?", "Notion is a flexible documents-and-databases tool; any structure is something you build and maintain yourself. A company OS ships real domain modules — CRM objects, sprint workflows, ticket pipelines, HR reviews — that share one data layer and can be operated by governed AI agents."],
        ["Does adopting a company OS mean replacing every tool at once?", "No. Teams typically start with one module — CRM, sprints, or workflows — connect it to their existing stack, and migrate adjacent workflows over time."],
        ["Can AI agents in a company OS be trusted with real data?", "That depends on governance. Look for policy gates (which tools an agent may use), approval workflows, field-level restrictions, rate limits, and an immutable audit log of every agent action. These are built into Aexy's agent runtime."],
        ["Is there an open-source AI company operating system?", "Yes. Aexy is open source under AGPL-3.0 and self-hostable for free, with a commercial cloud option. The full source is on GitHub."],
      ]}
      relatedLinks={[
        ["AI company OS overview", "/ai-company-os"],
        ["Best AI company operating systems 2026", "/guides/best-ai-company-operating-systems-2026"],
        ["Self-hosted AI company OS", "/guides/self-hosted-ai-company-os"],
        ["Replace SaaS sprawl", "/use-cases/replace-saas-sprawl"],
      ]}
    />
  );
}

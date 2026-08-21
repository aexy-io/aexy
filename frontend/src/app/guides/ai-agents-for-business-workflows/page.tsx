import type { Metadata } from "next";
import { GuideArticle } from "@/components/marketing/GuideArticle";

export const metadata: Metadata = {
  title: "AI Agents for Business Workflows: Automation Without Custom Code",
  description:
    "How governed AI agents automate CRM updates, ticket triage, follow-up drafts, and cross-tool workflows without custom development — and how policy gates, approvals, and audit logs keep them safe.",
  alternates: { canonical: "/guides/ai-agents-for-business-workflows" },
};

export default function AiAgentsForWorkflowsGuide() {
  return (
    <GuideArticle
      slug="ai-agents-for-business-workflows"
      eyebrow="AI agents for workflows"
      title="AI agents for business workflows: automation without custom code"
      description="An AI agent for business workflows is an LLM-driven worker that reads your company's real records — CRM, email, tickets, docs — decides what to do, and acts through governed tools. Unlike a chatbot, it completes work; unlike a Zapier chain, it handles ambiguity. This guide covers what agents can automate today, and the governance layer that makes them safe to deploy."
      keyFacts={[
        "Agents differ from rule-based automation by handling unstructured input: an email reply, a support ticket, a meeting note.",
        "Common production workflows: record enrichment, account summaries, reply classification, follow-up drafts, ticket triage, and routed next steps.",
        "Governance is the deciding factor: policy gates (block / require approval / restrict fields / rate-limit / cap token spend) plus an immutable audit log of every tool call.",
        "Agents work best inside a shared data layer — an agent that sees CRM, docs, and workflows together outperforms one scoped to a single tool.",
        "In Aexy, agents are built on LangGraph and every action passes through a policy engine before it executes.",
      ]}
      sections={[
        {
          heading: "What can an AI agent actually automate?",
          paragraphs: [
            "The reliable use cases share a shape: unstructured input, a judgment call a junior teammate could make, and a bounded action. Concretely, in production terms:",
          ],
          bullets: [
            "CRM upkeep: enrich a new contact from email signatures and public data, classify it (lead, customer, partner, vendor), and fill AI-computed fields from your own prompt templates.",
            "Revenue workflows: summarize an account's history before a call, classify inbound replies, draft follow-ups, and route high-intent accounts to owners.",
            "Ticket triage: when an alert or customer message arrives, categorize it, set priority, link related records, and escalate to a human when confidence is low.",
            "Cross-tool handoffs: when a deal closes, create onboarding tasks, notify the right Slack channel, and update the customer record — one agent action instead of three integrations.",
          ],
        },
        {
          heading: "Agents vs. Zapier-style automation vs. custom code",
          paragraphs: [
            "Rule-based automation (Zapier, Make, native workflow builders) is the right tool when the input is structured and the logic is enumerable: 'when a form is submitted, create a row.' It breaks down when the input is a paragraph of prose or the next step depends on context.",
            "Custom code handles anything but costs engineering time to build and maintain, and each workflow is a bespoke integration.",
            "Agents occupy the middle: they handle ambiguity without custom development, but they need two things rule-based tools don't — governance (because they make judgment calls) and context (because judgment requires seeing more than one tool's data). This is why agents embedded in a company OS outperform bolt-on assistants: the agent that drafts your follow-up can see the deal, the support history, and what engineering shipped last week.",
          ],
        },
        {
          heading: "How do you keep agents safe? The governance layer",
          paragraphs: [
            "The question every operations and security lead asks is not 'what can the agent do' but 'what can it not do.' A production agent runtime needs explicit, auditable answers. Aexy's policy engine is one concrete implementation:",
          ],
          bullets: [
            "Tool blocking: an agent simply cannot call tools outside its allowlist.",
            "Approval gates: sensitive actions (sending email, editing certain records) pause for human sign-off.",
            "Field restrictions: an agent may update a deal stage but never touch pricing fields.",
            "Rate limits and token budgets: caps on action frequency and LLM spend per agent.",
            "Immutable audit log: every run, tool call, policy decision, and configuration change is recorded and reviewable.",
          ],
        },
        {
          heading: "Where should a team start?",
          paragraphs: [
            "Start with a read-mostly workflow where a wrong answer is cheap: account summaries, reply classification, or enrichment. Measure for two weeks. Then graduate to write actions behind approval gates — drafts a human sends, records a human confirms. Remove the gates only where the agent has earned it. Teams that invert this order (full autonomy first, governance later) are the ones that turn agents back off.",
          ],
        },
      ]}
      faqs={[
        ["Do AI agents require custom development?", "Not for common workflows. In an agent-native platform, agents come with pre-built governed tools for CRM, email, docs, tickets, and workflows — you configure scope and policies rather than writing integration code."],
        ["How is an AI agent different from a chatbot?", "A chatbot answers questions; an agent completes work. Agents call tools — updating records, drafting email, creating tasks — and the good ones do it under explicit policies with an audit trail."],
        ["What stops an agent from doing something destructive?", "Policy gates. In Aexy, every tool call passes a policy engine that can block the tool, require human approval, restrict fields, rate-limit actions, or cap spend — and every decision is logged immutably."],
        ["Can agents work across multiple tools?", "Only if they share context. Agents inside a company OS act across CRM, docs, email, and workflows natively; agents bolted onto a single tool see only that tool's data."],
      ]}
      relatedLinks={[
        ["AI Agents product", "/products/ai-agents"],
        ["What is an AI company OS?", "/guides/what-is-an-ai-company-operating-system"],
        ["AI agents for CRM", "/use-cases/ai-agents-for-crm"],
        ["For AI agent builders", "/for/ai-agent-builders"],
      ]}
    />
  );
}

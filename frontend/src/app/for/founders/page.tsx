import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export const metadata: Metadata = {
  // `absolute` because the title already carries the brand; the root
  // layout's "%s | Aexy" template would otherwise render it twice.
  title: { absolute: "Aexy for Founders — One Company OS Instead of Ten Tools" },
  description:
    "Aexy helps founders run CRM, engineering, docs, hiring, workflows, and AI agents in one open-source company OS — instead of stitching together Notion, Zapier, Jira, and a CRM.",
  alternates: { canonical: "/for/founders" },
};

export default function FoundersPage() {
  return (
    <SeoLandingPage
      path="/for/founders"
      eyebrow="For founders"
      title="Run the company from one operating layer."
      description="Aexy gives founders one place to connect customers, product work, GTM signals, docs, hiring, workflows, and AI agents — before the stack fragments into ten subscriptions nobody reconciles."
      proofPoints={[
        "See customers, work, and ownership together.",
        "Start open source and add cloud/enterprise when needed.",
        "Use agents for summaries, routing, and workflow support.",
      ]}
      painPoints={[
        {
          problem: "Every new function brings a new tool: a CRM, a tracker, a docs wiki, an automation tool, an HR system. None of them talk.",
          solution: "One workspace with CRM, engineering, docs, workflows, and people ops sharing the same records and context.",
        },
        {
          problem: "You are the integration layer — copying context between tools and answering 'what's the status of X' all day.",
          solution: "Work, customers, and ownership live on connected records; status is visible without asking.",
        },
        {
          problem: "You want AI to actually run operations, but no assistant can see across your fragmented stack.",
          solution: "Aexy agents operate with company-wide context — CRM, docs, email, workflows — under approvals and audit history.",
        },
        {
          problem: "SaaS spend compounds per seat, per tool, per month — before you have revenue to match.",
          solution: "Open source and self-hostable: run the whole OS free on your own infrastructure, pay only for cloud convenience.",
        },
      ]}
      sections={[
        { title: "Founder visibility", body: "Keep the operating picture close without building a dashboard graveyard.", items: ["CRM and pipeline", "Product work", "Team workflows"] },
        { title: "Lean execution", body: "Run more with fewer disconnected tools and fewer manual handoffs.", items: ["Docs", "Forms", "Automations"] },
        { title: "Controlled AI", body: "Use agents where context and governance matter.", items: ["Approvals", "Tool access", "Audit history"] },
      ]}
      comparison={{
        heading: "Aexy vs the typical startup stack",
        description:
          "Most startups assemble Notion + Jira or Linear + a CRM + Zapier + an HR tool. Each is good alone; together they cost more, share nothing, and leave you as the glue.",
        competitorLabel: "Notion + Jira + CRM + Zapier",
        rows: [
          ["Context", "One operating graph: customers, work, docs, people, and workflows reference each other.", "Each tool holds a silo; context is copied by hand or lost."],
          ["Automation", "Workflows and AI agents act across CRM, email, docs, tickets, and people data natively — even alerts auto-create and auto-resolve tickets.", "Zapier-style bridges between tools; brittle, per-task, per-zap pricing."],
          ["AI readiness", "Agents get governed access to company-wide context with approvals and audit logs.", "Each tool ships its own assistant that only sees its own data."],
          ["Cost shape", "Self-host free; one platform to pay for if you choose cloud.", "Four to ten subscriptions, each priced per seat per month."],
          ["Data ownership", "Open source, exportable, self-hostable.", "Locked in per vendor; export quality varies."],
        ],
        links: [
          ["Aexy vs Notion", "/compare/notion"],
          ["Aexy vs Jira", "/compare/jira"],
          ["Replace SaaS sprawl", "/use-cases/replace-saas-sprawl"],
        ],
      }}
      showPricingCta
      faqs={[
        ["Is Aexy useful before hiring a full ops team?", "Yes. It is designed to centralize work early and prevent expensive stack fragmentation."],
        ["Can founders self-host?", "Yes. The open-source path is useful for technical founders that want control and transparency."],
        ["What should founders adopt first?", "Start with CRM, docs, planning, or GTM workflows depending on the biggest current coordination problem. You don't have to move everything at once."],
        ["How is Aexy different from just using Notion for everything?", "Notion is a flexible document tool; structure is whatever you build in it. Aexy ships real CRM objects, sprint and ticket workflows, HR modules, and governed AI agents — with docs and a knowledge graph included."],
      ]}
      relatedLinks={[["AI company OS", "/ai-company-os"], ["Open source company OS", "/open-source-company-os"], ["Pricing", "/pricing"], ["Contact", "/contact"]]}
      schema={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Aexy for Founders",
        description: "One open-source company OS for founders — CRM, engineering, docs, hiring, workflows, and AI agents instead of ten disconnected tools.",
      }}
    />
  );
}

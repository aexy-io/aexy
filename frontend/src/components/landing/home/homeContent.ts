import {
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Code2,
  Rocket,
  Shield,
  Workflow,
} from "lucide-react";

// Homepage marketing content, moved out of app/page.tsx so the page itself can
// be a server component that composes sections. Everything here is hardcoded
// English except the MCP block: that section's strings live in
// messages/<locale>/marketingMcp.json and are resolved at render, so
// translating the rest of marketing later is a copy pass rather than a
// refactor.

export const homepageFaqs = [
  {
    question: "What is an AI company operating system?",
    answer:
      "An AI company operating system is one workspace where core company data, workflows, and AI agents share context across teams instead of living in disconnected SaaS tools.",
  },
  {
    question: "Can Aexy replace our CRM?",
    answer:
      "Aexy includes a custom-object CRM with contacts, companies, deals, activities, email sync, automations, and GTM intelligence. Teams can start with CRM and expand into engineering, docs, workflows, and people operations.",
  },
  {
    question: "Can Aexy be self-hosted?",
    answer:
      "Yes. Aexy is open source and self-hostable, with a cloud option for teams that want managed infrastructure.",
  },
  {
    question: "How do Aexy AI agents work?",
    answer:
      "Aexy agents run inside governed company context. They can use approved tools such as CRM records, email, enrichment, Slack, workflows, and docs, with policy gates, approvals, and audit history.",
  },
  {
    question: "How is Aexy different from Jira or Linear for engineering teams?",
    answer:
      "Jira and Linear track issues in isolation. Aexy covers sprints, tasks, GitHub sync, and delivery analytics — connected to CRM, docs, and workflows in the same workspace, so planning reflects customer commitments and AI agents can act across all of it.",
  },
  {
    question: "How does Aexy compare to HubSpot or Attio for revenue teams?",
    answer:
      "Like HubSpot and Attio, Aexy includes a schema-flexible CRM with visitor identification, lead scoring, sequences, and routing. Unlike them, it is open source, self-hostable, and agent-native — and the CRM shares context with engineering and operations instead of living in a silo.",
  },
];

// Structure here, strings in messages/<locale>/marketingMcp.json — the same
// split as MCP_ENV_VARS in config/mcpClients.ts. Keys are resolved with
// `tMcp(`home.cards.${key}.title`)` at render.
export const MCP_HOME_CARDS = [
  { key: "anyClient", icon: Bot },
  { key: "realWork", icon: Workflow },
  { key: "oauth", icon: Shield },
  { key: "revoke", icon: CheckCircle2 },
] as const;

export const icpTracks = [
  {
    label: "Revenue teams",
    icon: BriefcaseBusiness,
    pain: "Your CRM can't see product usage, support history, or what engineering shipped for a customer.",
    replacesTools: ["hubspot", "attio", "gtm point tools"],
    features: ["Agent-native CRM", "Visitor ID & lead scoring", "Sequences & routing"],
    href: "/for/revenue-teams",
    compare: [
      { label: "vs HubSpot", href: "/compare/hubspot" },
      { label: "vs Attio", href: "/compare/attio" },
    ],
  },
  {
    label: "Engineering teams",
    icon: Code2,
    pain: "Sprints, tickets, and releases live in trackers that know nothing about customers or revenue.",
    replacesTools: ["jira", "linear", "stray trackers"],
    features: ["Sprint lifecycle & tasks", "GitHub sync & analytics", "Release readiness"],
    href: "/for/engineering-managers",
    compare: [
      { label: "vs Jira", href: "/compare/jira" },
      { label: "vs Linear", href: "/compare/linear" },
    ],
  },
  {
    label: "Founders & operations",
    icon: Rocket,
    pain: "Docs, workflows, hiring, and reporting are scattered across a dozen subscriptions nobody reconciles.",
    replacesTools: ["notion", "zapier", "hr point tools"],
    features: ["Docs & knowledge graph", "Workflows & approvals", "Hiring & reviews"],
    href: "/for/founders",
    compare: [
      { label: "vs Notion", href: "/compare/notion" },
      { label: "vs ServiceNow", href: "/compare/servicenow" },
    ],
  },
];

export const comparisons = [
  { name: "Jira", href: "/compare/jira", gap: "Project tracking that also understands customers, docs, and AI agents." },
  { name: "Linear", href: "/compare/linear", gap: "Fast issue tracking, plus the rest of the company OS around it." },
  { name: "HubSpot", href: "/compare/hubspot", gap: "CRM and GTM without per-seat sprawl — open source and agent-native." },
  { name: "Salesforce", href: "/compare/salesforce", gap: "CRM depth for growing teams without the implementation tax." },
  { name: "Attio", href: "/compare/attio", gap: "A flexible CRM data model, connected to engineering and workflows." },
  { name: "Notion", href: "/compare/notion", gap: "Docs and knowledge with real structure — plus workflows that act." },
];

// Takes the FAQ list rather than reading the module-scoped one: part of that
// list is translated, and structured data built at module scope would emit
// English questions beside whatever the visitor is actually reading.
export function buildHomepageJsonLd(faqs: readonly { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://aexy.io/#organization",
        name: "Aexy",
        url: "https://aexy.io",
        sameAs: ["https://github.com/aexy-io/aexy"],
        founder: {
          "@type": "Person",
          "@id": "https://aexy.io/about#bhanu",
          name: "Bhanu Pratap Chaudhary",
          jobTitle: "Founder, Aexy",
          sameAs: ["https://github.com/bhanuc", "https://bhanu.io"],
        },
      },
      {
        "@type": "WebSite",
        "@id": "https://aexy.io/#website",
        name: "Aexy",
        url: "https://aexy.io",
        publisher: {
          "@id": "https://aexy.io/#organization",
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://aexy.io/#software",
        name: "Aexy",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "Aexy is an open-source, AI-native company operating system that replaces separate CRM, engineering, workflow, HR, and docs tools with one workspace shared by teams and AI agents. It connects to ChatGPT, Claude, and Cursor over the Model Context Protocol. Alternative to Jira, Linear, HubSpot, Attio, and Notion.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Open-source self-hosted option available.",
        },
        publisher: {
          "@id": "https://aexy.io/#organization",
        },
      },
      {
        "@type": "FAQPage",
        "@id": "https://aexy.io/#faq",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };
}

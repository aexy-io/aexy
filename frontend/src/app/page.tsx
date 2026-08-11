"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { safeInternalPath, stashPostLoginRedirect } from "@/lib/oauth";
import { setAuthPresenceCookie, clearAuthPresenceCookie } from "@/lib/authCookie";
import { repositoriesApi } from "@/lib/api";
import {
  ArrowRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Code2,
  DatabaseZap,
  FileText,
  GitBranch,
  Menu,
  Network,
  Plug,
  Rocket,
  Shield,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { useTranslations } from "next-intl";
import { McpChatPreview } from "@/components/landing/McpChatPreview";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const pillars = [
  {
    title: "Build",
    label: "Engineering",
    icon: Code2,
    description: "Sprints, tasks, GitHub/Jira/Linear sync, analytics, releases, uptime, and engineering reviews.",
    features: ["Sprint lifecycle", "Commit & PR auto-linking", "Developer insights", "Release readiness"],
    accent: "from-cyan-500 to-blue-500",
  },
  {
    title: "Sell",
    label: "Revenue",
    icon: BriefcaseBusiness,
    description: "CRM, GTM intelligence, visitor identification, lead scoring, sequences, routing, and customer health.",
    features: ["Schema-less CRM", "Visitor ID", "Lead scoring", "Expansion playbooks"],
    accent: "from-amber-500 to-orange-500",
  },
  {
    title: "Operate",
    label: "Workflows",
    icon: Workflow,
    description: "Automations, visual workflows, tickets, forms, reminders, approvals, and operational handoffs.",
    features: ["No-code triggers", "Branching workflows", "Alert → ticket automation", "Audit trails"],
    accent: "from-emerald-500 to-teal-500",
  },
  {
    title: "Grow",
    label: "People",
    icon: Users,
    description: "Hiring, assessments, performance reviews, learning paths, compliance, leave, and team development.",
    features: ["360 reviews", "AI assessments", "Learning paths", "Skill gaps"],
    accent: "from-rose-500 to-pink-500",
  },
  {
    title: "Know",
    label: "Knowledge",
    icon: Network,
    description: "Docs, Drive, AI metadata, knowledge graph, MCP tools, custom tables, and company-wide reporting.",
    features: ["Rich docs", "AI metadata", "Knowledge graph", "MCP tools"],
    accent: "from-violet-500 to-purple-500",
  },
];

const proofPoints = [
  "Open source and self-hostable",
  "AI-native workflows and agents",
  "Built for company-wide context",
  "Designed to replace SaaS sprawl",
];

const useCases = [
  "Replace disconnected Jira, CRM, docs, HR, and workflow tools with one connected operating layer.",
  "Give AI agents governed access to CRM records, email, Slack, docs, workflows, and business context.",
  "Connect engineering delivery, GTM execution, people growth, and company knowledge in one workspace.",
];

const homepageFaqs = [
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
// `tMcp(\`home.cards.${key}.title\`)` at render.
const MCP_HOME_CARDS = [
  { key: "anyClient", icon: Bot },
  { key: "realWork", icon: Workflow },
  { key: "oauth", icon: Shield },
  { key: "revoke", icon: CheckCircle2 },
] as const;

const platformLinks = [
  { title: "AI Agents", href: "/products/ai-agents", description: "Governed agents for CRM, email, workflows, and company context." },
  { title: "MCP Server", href: "/products/mcp", description: "Run Aexy from ChatGPT, Claude, Cursor, or Codex over the Model Context Protocol." },
  { title: "GTM Intelligence", href: "/products/gtm-intelligence", description: "Visitor identification, lead scoring, routing, sequences, and expansion." },
  { title: "CRM", href: "/products/crm", description: "A flexible CRM that humans and AI agents can operate together." },
  { title: "Company OS", href: "/ai-company-os", description: "The category page for Aexy's operating-system approach." },
  { title: "Docs", href: "/handbook", description: "Architecture, module guides, APIs, and implementation proof." },
  { title: "Pricing", href: "/pricing", description: "Self-host free, use cloud for speed, scale with enterprise controls." },
];

const icpTracks = [
  {
    label: "Revenue teams",
    icon: BriefcaseBusiness,
    accent: "from-amber-500 to-orange-500",
    pain: "Your CRM can't see product usage, support history, or what engineering shipped for a customer.",
    replaces: "Replaces HubSpot, Attio, and standalone GTM tools",
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
    accent: "from-cyan-500 to-blue-500",
    pain: "Sprints, tickets, and releases live in trackers that know nothing about customers or revenue.",
    replaces: "Replaces Jira, Linear, and disconnected trackers",
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
    accent: "from-violet-500 to-purple-500",
    pain: "Docs, workflows, hiring, and reporting are scattered across a dozen subscriptions nobody reconciles.",
    replaces: "Replaces Notion, Zapier, and HR point tools",
    features: ["Docs & knowledge graph", "Workflows & approvals", "Hiring & reviews"],
    href: "/for/founders",
    compare: [
      { label: "vs Notion", href: "/compare/notion" },
      { label: "vs ServiceNow", href: "/compare/servicenow" },
    ],
  },
];

const comparisons = [
  { name: "Jira", href: "/compare/jira", gap: "Project tracking that also understands customers, docs, and AI agents." },
  { name: "Linear", href: "/compare/linear", gap: "Fast issue tracking, plus the rest of the company OS around it." },
  { name: "HubSpot", href: "/compare/hubspot", gap: "CRM and GTM without per-seat sprawl — open source and agent-native." },
  { name: "Salesforce", href: "/compare/salesforce", gap: "CRM depth for growing teams without the implementation tax." },
  { name: "Attio", href: "/compare/attio", gap: "A flexible CRM data model, connected to engineering and workflows." },
  { name: "Notion", href: "/compare/notion", gap: "Docs and knowledge with real structure — plus workflows that act." },
];

export default function Home() {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  // The only translated copy on this page. The rest of the marketing surface is
  // hardcoded English; new copy goes through i18n so translating marketing later
  // is a copy pass rather than a refactor.
  const tMcp = useTranslations("marketingMcp");

  // Slotted in after the agents question so the two AI answers sit together.
  // Feeds both the visible list and the FAQPage structured data from one source,
  // so the two cannot disagree.
  const faqs = [
    ...homepageFaqs.slice(0, 4),
    { question: tMcp("faq.question"), answer: tMcp("faq.answer") },
    ...homepageFaqs.slice(4),
  ];

  // The marketing content below is rendered unconditionally so it is present
  // in the server HTML (crawlable). Logged-in visitors are bounced to the app:
  // the common case is handled at the edge (middleware redirects "/" when the
  // aexy_authed cookie is set); this effect covers the localStorage-token /
  // deep-link (?next=) cases without hiding content behind a client gate.
  useEffect(() => {
    // Honour ?next= from the middleware auth gate. Two cases:
    //  1. User is already authed (e.g., they clicked a deep link in a new
    //     tab while logged in) — redirect them straight to their target.
    //  2. User is logged out — stash it in sessionStorage so the OAuth
    //     callback can complete the redirect after token exchange.
    const rawNext =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
    const nextPath = safeInternalPath(rawNext);
    const token = localStorage.getItem("token");
    if (token) {
      // We validate the token THROUGH `getOnboardingStatus` before
      // syncing the middleware-visible `aexy_authed` cookie. The
      // previous order set the cookie first, which left stale-token
      // users routed to /onboarding (the layout's own status check
      // would then "fail open" and grant access to a protected
      // shell). The fix: validate first, then mark authed.
      repositoriesApi
        .getOnboardingStatus()
        .then((status) => {
          setAuthPresenceCookie();
          router.replace(status.completed ? nextPath ?? "/dashboard" : "/onboarding");
        })
        .catch((err) => {
          // 401 means the token is dead — wipe both the localStorage
          // entry and the presence cookie, then surface the login
          // CTA on this same page. Any other error (network blip,
          // 5xx) is transient: keep the user where they are and let
          // the next click retry.
          const status = (err as { response?: { status?: number } })
            ?.response?.status;
          if (status === 401 || status === 403) {
            // Dead token — clear it and leave the visitor on the landing
            // page (already rendered) with the login CTA.
            localStorage.removeItem("token");
            clearAuthPresenceCookie();
            if (nextPath) stashPostLoginRedirect(nextPath);
          }
          // Any other error (network blip, 5xx) is transient — keep the
          // visitor on the landing page and let the next click retry.
        });
    } else {
      if (nextPath) stashPostLoginRedirect(nextPath);
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-[#08090d] text-white overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildHomepageJsonLd(faqs)) }}
      />
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.16),transparent_32%),radial-gradient(circle_at_72%_8%,rgba(168,85,247,0.14),transparent_30%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[auto,auto,72px_72px,72px_72px]" />
      </div>

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#08090d]/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative rounded-xl bg-white p-2 text-black">
              <GitBranch className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Aexy</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-white/62 md:flex">
            <a href="#solutions" className="hover:text-white transition">Solutions</a>
            <a href="#platform" className="hover:text-white transition">Platform</a>
            <a href="#agents" className="hover:text-white transition">AI Agents</a>
            <a href="#mcp" className="hover:text-white transition">{tMcp("nav.label")}</a>
            <a href="#compare" className="hover:text-white transition">Compare</a>
            <Link href="/pricing" className="hover:text-white transition">Pricing</Link>
            <Link href="/handbook" className="hover:text-white transition">Docs</Link>
            <a href="https://github.com/aexy-io/aexy" className="flex items-center gap-1 hover:text-white transition">
              <SiGithub className="h-4 w-4" />
              GitHub
            </a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg border border-white/10 p-2 text-white/80 md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="border-t border-white/10 bg-[#08090d] px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-4 text-sm text-white/72">
              <a href="#solutions" onClick={() => setMobileOpen(false)}>Solutions</a>
              <a href="#platform" onClick={() => setMobileOpen(false)}>Platform</a>
              <a href="#agents" onClick={() => setMobileOpen(false)}>AI Agents</a>
              <a href="#mcp" onClick={() => setMobileOpen(false)}>{tMcp("nav.label")}</a>
              <a href="#compare" onClick={() => setMobileOpen(false)}>Compare</a>
              <Link href="/pricing" onClick={() => setMobileOpen(false)}>Pricing</Link>
              <Link href="/handbook" onClick={() => setMobileOpen(false)}>Docs</Link>
              <a href="https://github.com/aexy-io/aexy" className="flex items-center gap-2">
                <SiGithub className="h-4 w-4" />
                GitHub
              </a>
              <Link href="/login" onClick={() => setMobileOpen(false)} className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 font-semibold text-black">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </nav>
          </div>
        )}
      </header>

      <section className="relative px-4 pb-16 pt-28 sm:px-6 sm:pb-24 sm:pt-36">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.86fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              AI company OS — now in ChatGPT and Claude
            </div>
            {/* The ChatGPT angle lives in the badge and subhead, not here. Appending
                it to the h1 pushed this to five lines at lg and swamped the hero —
                the CTAs fell below the fold. The h1 is not the SERP title either
                (that comes from layout.tsx), so it loses nothing by staying put. */}
            <h1 className="max-w-4xl text-5xl font-semibold leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
              CRM, engineering, and ops. One AI-native workspace.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/62 sm:text-xl">
              Your CRM can&apos;t see what engineering shipped. Your sprints can&apos;t see revenue. Aexy replaces the HubSpot + Jira + Notion sprawl with one open-source company OS — where your team, your AI agents, and the assistant you already use share the same context.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 text-base font-semibold text-black transition hover:bg-white/90"
              >
                Start free
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 text-base font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Book demo
                <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/45">
              <span>Works with Google, GitHub, and Microsoft accounts</span>
              <span className="text-white/20">/</span>
              <Link href="/products/mcp" className="hover:text-white transition">
                {tMcp("hero.linkLabel")} →
              </Link>
              <span className="text-white/20">/</span>
              <a href="https://github.com/aexy-io/aexy" className="hover:text-white transition">View source</a>
            </div>
          </div>

          <CompanyOSPreview />
        </div>
      </section>

      <section className="relative border-y border-white/10 bg-white/[0.025] px-4 py-5 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {proofPoints.map((point) => (
            <div key={point} className="flex items-center gap-2 text-sm text-white/64">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              {point}
            </div>
          ))}
        </div>
      </section>

      <section id="solutions" className="relative px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-amber-300">Who is Aexy for</p>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Pick your team. Start where it hurts most.
            </h2>
            <p className="mt-5 text-lg leading-8 text-white/56">
              You don&apos;t adopt a company OS in one day. Start with the workflow your team is fighting today, then expand into the shared operating layer.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {icpTracks.map(({ label, icon: Icon, accent, pain, replaces, features, href, compare }) => (
              <article key={label} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:border-white/25">
                <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${accent}`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-2xl font-semibold">{label}</h3>
                <p className="mt-3 text-sm leading-6 text-white/54">{pain}</p>
                <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-white/62">
                      <CheckCircle2 className="h-3.5 w-3.5 text-white/45" />
                      {feature}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-white/38">{replaces}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-6">
                  <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white transition hover:text-cyan-300">
                    See how it works
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  {compare.map((c) => (
                    <Link key={c.href} href={c.href} className="text-sm text-white/45 underline-offset-4 transition hover:text-white hover:underline">
                      {c.label}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="relative px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Platform</p>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              One operating layer for the work, customers, people, and knowledge behind your company.
            </h2>
            <p className="mt-5 text-lg leading-8 text-white/56">
              Aexy is not another point solution. It connects the systems companies normally buy separately, then gives AI agents governed access to that shared context.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {pillars.map(({ title, label, icon: Icon, description, features, accent }) => (
              <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${accent}`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
                <h3 className="mt-2 text-2xl font-semibold">{title}</h3>
                <p className="mt-3 min-h-24 text-sm leading-6 text-white/54">{description}</p>
                <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-white/62">
                      <CheckCircle2 className="h-3.5 w-3.5 text-white/45" />
                      {feature}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="agents" className="relative px-4 py-20 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-10 lg:grid-cols-[0.9fr_1fr]">
          <div>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500">
              <Bot className="h-6 w-6" />
            </div>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              AI agents that understand your company context.
            </h2>
            <p className="mt-5 text-lg leading-8 text-white/58">
              Aexy agents can read CRM history, draft emails, enrich accounts, update records, call workflows, and escalate to humans through policy gates.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Tool access", "CRM, email, enrichment, Slack, workflows, docs, and company records."],
              ["Policy gates", "Require approval, block tools, restrict fields, rate-limit actions, and cap spend."],
              ["Automation hooks", "Invoke agents when a lead replies, a deal changes, a ticket arrives, or a workflow branches."],
              ["Audit history", "Every run, tool call, policy decision, and config change is visible."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sits after #agents on purpose: that section establishes governed tool
          access inside the workspace, and this is the same claim turned outward —
          the agent can be one the visitor already pays for. */}
      <section id="mcp" className="relative px-4 py-20 sm:px-6">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.9fr_1fr]">
          <div>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500">
              <Plug className="h-6 w-6" />
            </div>
            <div className="mb-4 text-sm font-medium uppercase tracking-wide text-teal-300/80">
              {tMcp("home.eyebrow")}
            </div>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              {tMcp("home.heading")}
            </h2>
            <p className="mt-5 text-lg leading-8 text-white/58">{tMcp("home.body")}</p>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {MCP_HOME_CARDS.map(({ key, icon: Icon }) => (
                <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                  <Icon className="mb-3 h-5 w-5 text-teal-300" />
                  <h3 className="text-base font-semibold">
                    {tMcp(`home.cards.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    {tMcp(`home.cards.${key}.body`)}
                  </p>
                </div>
              ))}
            </div>
            <Link
              href="/products/mcp"
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-teal-300 transition hover:text-teal-200"
            >
              {tMcp("home.cta")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <McpChatPreview />
        </div>
      </section>

      <section id="use-cases" className="relative px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1fr]">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-emerald-300">Why Aexy</p>
              <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Start with one workflow. Grow into one company OS.
              </h2>
            </div>
            <div className="space-y-4">
              {useCases.map((useCase, index) => (
                <div key={useCase} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-black">
                    {index + 1}
                  </div>
                  <p className="text-lg leading-8 text-white/65">{useCase}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="compare" className="relative px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-rose-300">Compare</p>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Already using Jira, HubSpot, or Notion?
            </h2>
            <p className="mt-5 text-lg leading-8 text-white/56">
              Aexy replaces point tools one workflow at a time. See exactly what you gain — and what changes — against the tool your team uses today.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {comparisons.map(({ name, href, gap }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-white/25 hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-xl font-semibold">Aexy vs {name}</h3>
                  <ArrowRight className="h-5 w-5 text-white/35 transition group-hover:translate-x-1 group-hover:text-white" />
                </div>
                <p className="mt-3 text-sm leading-6 text-white/52">{gap}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1fr] lg:items-center">
            <div>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black">
                <Shield className="h-6 w-6" />
              </div>
              <h2 className="text-4xl font-semibold tracking-tight">
                Transparent by design. Flexible by default.
              </h2>
              <p className="mt-5 text-lg leading-8 text-white/58">
                Aexy is open source and self-hostable, with exportable data and auditable logic. Use cloud to move fast or run it on your own infrastructure.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["Self-host free", "Run the full OS on your own infrastructure at no cost."],
                ["AGPL-3.0 licensed", "The entire codebase is public — read how every feature works."],
                ["Data export", "Your records, docs, and workflows are exportable, always."],
                ["Commercial cloud", "Managed hosting when you want speed over ops."],
              ] as const).map(([item, detail]) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-lg font-semibold">{item}</div>
                  <p className="mt-1.5 text-sm leading-6 text-white/48">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-violet-300">Explore</p>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Start with the highest-leverage workflow.
            </h2>
            <p className="mt-5 text-lg leading-8 text-white/56">
              Aexy is broad by design, but adoption does not need to be. Start with agents, GTM, CRM, docs, or company-OS strategy, then expand into the shared operating layer.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {platformLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-white/25 hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-xl font-semibold">{item.title}</h3>
                  <ArrowRight className="h-5 w-5 text-white/35 transition group-hover:translate-x-1 group-hover:text-white" />
                </div>
                <p className="mt-3 text-sm leading-6 text-white/52">{item.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">FAQ</p>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Questions companies ask before replacing the stack.
            </h2>
          </div>
          <div className="mt-10 space-y-4">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
                <h3 className="text-lg font-semibold">{faq.question}</h3>
                <p className="mt-3 text-sm leading-6 text-white/58">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Run the company from one AI workspace.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/56">
            Bring engineering, GTM, people, knowledge, and AI agents into the same operating system.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/login" className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black">
              Start free
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/contact" className="inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 font-semibold text-white">
              Book demo
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

// Takes the FAQ list rather than reading the module-scoped one: part of that
// list is now translated, and structured data built at module scope would emit
// English questions beside whatever the visitor is actually reading.
function buildHomepageJsonLd(faqs: readonly { question: string; answer: string }[]) {
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

function CompanyOSPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-cyan-500/16 via-violet-500/16 to-emerald-500/12 blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d0f14] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Company Command Center</div>
              <div className="text-xs text-white/42">Live operating graph</div>
            </div>
          </div>
          <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
            Synced
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <PreviewCard icon={Rocket} title="Engineering" stat="24 active tasks" body="Sprint, backlog, releases, velocity" />
          <PreviewCard icon={BarChart3} title="GTM" stat="18 hot accounts" body="Visitor ID, scoring, routing, ABM" />
          <PreviewCard icon={Users} title="People" stat="7 growth plans" body="Hiring, reviews, learning, leave" />
          <PreviewCard icon={FileText} title="Knowledge" stat="1,284 indexed docs" body="Docs, Drive, graph, MCP tools" />
        </div>
        <div className="border-t border-white/10 p-4">
          <div className="rounded-2xl border border-violet-400/20 bg-violet-400/8 p-4">
            <div className="flex items-center gap-3">
              <Bot className="h-5 w-5 text-violet-300" />
              <div>
                <div className="text-sm font-semibold">Sales agent routed a high-intent account</div>
                <div className="mt-1 text-xs text-white/48">Checked policy, enriched CRM, created task, notified Slack.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  icon: Icon,
  title,
  stat,
  body,
}: {
  icon: typeof Rocket;
  title: string;
  stat: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-center justify-between">
        <Icon className="h-5 w-5 text-white/72" />
        <div className="h-2 w-2 rounded-full bg-emerald-300" />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xl font-semibold">{stat}</div>
      <div className="mt-2 text-xs leading-5 text-white/45">{body}</div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-white/10 px-4 py-12 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white p-2 text-black">
              <GitBranch className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">Aexy</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/45">
            The open-source AI company OS. One workspace for CRM, engineering, workflows, people, and AI agents.
          </p>
        </div>
        <FooterColumn title="Platform" links={[["AI Agents", "/products/ai-agents"], ["MCP Server", "/products/mcp"], ["GTM Intelligence", "/products/gtm-intelligence"], ["CRM", "/products/crm"], ["Planning", "/products/planning"]]} />
        <FooterColumn title="Solutions" links={[["Revenue teams", "/for/revenue-teams"], ["Engineering teams", "/for/engineering-managers"], ["Founders & ops", "/for/founders"], ["HR & people ops", "/for/people-ops"]]} />
        <FooterColumn title="Compare" links={[["Aexy vs Jira", "/compare/jira"], ["Aexy vs Linear", "/compare/linear"], ["Aexy vs HubSpot", "/compare/hubspot"], ["Aexy vs Notion", "/compare/notion"]]} />
        <div>
          <h3 className="font-semibold">Company</h3>
          <div className="mt-4 space-y-3 text-sm text-white/45">
            <Link href="/pricing" className="block hover:text-white transition">Pricing</Link>
            <Link href="/about" className="block hover:text-white transition">About</Link>
            <Link href="/contact" className="block hover:text-white transition">Contact</Link>
            <Link href="/handbook" className="block hover:text-white transition">Docs</Link>
            <Link href="/security" className="block hover:text-white transition">Security</Link>
            <a href="https://github.com/aexy-io/aexy" className="flex items-center gap-2 hover:text-white transition">
              <SiGithub className="h-4 w-4" />
              GitHub
            </a>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-3 border-t border-white/10 pt-6 text-sm text-white/35 sm:flex-row sm:justify-between">
        <p>&copy; 2026 Aexy. All rights reserved.</p>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition">Terms</Link>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-4 space-y-3 text-sm text-white/45">
        {links.map(([label, href]) => (
          <Link key={href} href={href} className="block hover:text-white transition">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}


"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  Rocket,
  Shield,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const pillars = [
  {
    title: "Build",
    label: "Engineering",
    icon: Code2,
    description: "Sprints, tasks, GitHub/Jira/Linear sync, analytics, releases, uptime, and engineering reviews.",
    features: ["Sprint lifecycle", "Task intelligence", "Developer insights", "Release readiness"],
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
    features: ["No-code triggers", "Branching workflows", "Agent actions", "Audit trails"],
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
];

const platformLinks = [
  { title: "AI Agents", href: "/products/ai-agents", description: "Governed agents for CRM, email, workflows, and company context." },
  { title: "GTM Intelligence", href: "/products/gtm-intelligence", description: "Visitor identification, lead scoring, routing, sequences, and expansion." },
  { title: "CRM", href: "/products/crm", description: "A flexible CRM that humans and AI agents can operate together." },
  { title: "Company OS", href: "/ai-company-os", description: "The category page for Aexy's operating-system approach." },
  { title: "Docs", href: "/handbook", description: "Architecture, module guides, APIs, and implementation proof." },
  { title: "Pricing", href: "/pricing", description: "Self-host free, use cloud for speed, scale with enterprise controls." },
];

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;
  const githubLoginUrl = `${API_BASE_URL}/auth/github/login`;
  const microsoftLoginUrl = `${API_BASE_URL}/auth/microsoft/login`;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      router.replace("/dashboard");
    } else {
      setIsChecking(false);
    }
  }, [router]);

  if (isChecking) {
    return (
      <main className="min-h-screen bg-[#08090d] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#08090d] text-white overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageJsonLd) }}
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
            <a href="#platform" className="hover:text-white transition">Platform</a>
            <a href="#agents" className="hover:text-white transition">AI Agents</a>
            <a href="#use-cases" className="hover:text-white transition">Use Cases</a>
            <Link href="/pricing" className="hover:text-white transition">Pricing</Link>
            <Link href="/handbook" className="hover:text-white transition">Docs</Link>
            <a href="https://github.com/aexy-io/aexy" className="flex items-center gap-1 hover:text-white transition">
              <SiGithub className="h-4 w-4" />
              GitHub
            </a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a href={githubLoginUrl} className="text-sm font-medium text-white/70 hover:text-white transition">
              Sign in
            </a>
            <a
              href={googleLoginUrl}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </a>
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
              <a href="#platform" onClick={() => setMobileOpen(false)}>Platform</a>
              <a href="#agents" onClick={() => setMobileOpen(false)}>AI Agents</a>
              <a href="#use-cases" onClick={() => setMobileOpen(false)}>Use Cases</a>
              <Link href="/pricing" onClick={() => setMobileOpen(false)}>Pricing</Link>
              <Link href="/handbook" onClick={() => setMobileOpen(false)}>Docs</Link>
              <a href="https://github.com/aexy-io/aexy" className="flex items-center gap-2">
                <SiGithub className="h-4 w-4" />
                GitHub
              </a>
              <a href={googleLoginUrl} className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 font-semibold text-black">
                Start free
                <ArrowRight className="h-4 w-4" />
              </a>
            </nav>
          </div>
        )}
      </header>

      <section className="relative px-4 pb-16 pt-28 sm:px-6 sm:pb-24 sm:pt-36">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.86fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              AI company operating system
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
              Aexy is the AI superapp for companies.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/62 sm:text-xl">
              Replace scattered tools for engineering, CRM, GTM, people, docs, workflows, and AI agents with one connected company operating system.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href={googleLoginUrl}
                className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 text-base font-semibold text-black transition hover:bg-white/90"
              >
                <GoogleIcon />
                Start free
                <ArrowRight className="h-5 w-5" />
              </a>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 text-base font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Book demo
                <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/45">
              <a href={microsoftLoginUrl} className="hover:text-white transition">Continue with Microsoft</a>
              <span className="text-white/20">/</span>
              <a href={githubLoginUrl} className="hover:text-white transition">Continue with GitHub</a>
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
              {["Self-host free", "Open algorithms", "Data export", "Commercial cloud"].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-5 text-lg font-semibold">
                  {item}
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
            {homepageFaqs.map((faq) => (
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
            <a href={googleLoginUrl} className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black">
              <GoogleIcon />
              Start free
              <ArrowRight className="h-5 w-5" />
            </a>
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

const homepageJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://aexy.io/#organization",
      name: "Aexy",
      url: "https://aexy.io",
      sameAs: ["https://github.com/aexy-io/aexy"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://aexy.io/#software",
      name: "Aexy",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Aexy is an AI company operating system for engineering, CRM, GTM, people, docs, workflows, and AI agents.",
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
      mainEntity: homepageFaqs.map((faq) => ({
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
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white p-2 text-black">
              <GitBranch className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">Aexy</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/45">
            The AI superapp for companies. Open source, self-hostable, and built for modern teams.
          </p>
        </div>
        <FooterColumn title="Platform" links={[["AI Agents", "/products/ai-agents"], ["GTM Intelligence", "/products/gtm-intelligence"], ["CRM", "/products/crm"], ["Planning", "/products/planning"]]} />
        <FooterColumn title="Company" links={[["Pricing", "/pricing"], ["About", "/about"], ["Mission", "/mission"], ["Contact", "/contact"]]} />
        <div>
          <h3 className="font-semibold">Resources</h3>
          <div className="mt-4 space-y-3 text-sm text-white/45">
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

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

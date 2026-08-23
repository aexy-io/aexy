"use client";

import Link from "next/link";
import {
  ArrowRight,
  FileText,
  CheckCircle2,
  Search,
  Users,
  History,
  Lock,
  Link2,
  FolderTree,
  PenLine,
  Eye,
  Share2,
  BookOpen,
  Sparkles,
  MessageSquare,
  Github,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { ProductShot } from "@/components/marketing/ProductShot";
import docsShot from "../../../../public/marketing/home/home-know@2x.webp";


const features = [
  {
    icon: PenLine,
    title: "Rich Text Editor",
    description: "Markdown and WYSIWYG editing. Code blocks with syntax highlighting, tables, and embeds.",
  },
  {
    icon: FolderTree,
    title: "Organized by Default",
    description: "Hierarchical structure with folders and tags. Find any document instantly with powerful search.",
  },
  {
    icon: Link2,
    title: "Linked to Everything",
    description: "Connect docs to tickets, PRs, epics, and team members. Build a living knowledge base.",
  },
  {
    icon: History,
    title: "Version History",
    description: "Full revision history with diffs. Restore previous versions with one click.",
  },
];

export default function DocsProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <FileText className="h-4 w-4" />
                <span>Documentation</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Documentation that{" "}
                <span className="text-ledger-green">stays current</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                Write docs that connect to your code and work. Version-controlled,
                searchable, and always linked to the right context.
              </p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  Start Writing Free
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/pricing"
                  className="group inline-flex items-center justify-center gap-2 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-medium text-ledger-ink transition hover:border-ledger-ink/50"
                >
                  See pricing
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-ledger-ink/55">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Markdown support
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Real-time collaboration
                </span>
              </div>
            </div>

            {/* Visual - Doc Preview.

                DARK PANE: a genuine product mockup — the docs editor as the app
                renders it — so it keeps the plate treatment used for product UI
                on the paper page (see OsConsolePreview): ledger-pane ground,
                white-opacity type, ledger-mint as the only accent. The white/*
                utilities below are scoped to this pane on purpose. */}
            <div className="overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane text-[#E6EDE7] shadow-[0_1px_0_rgba(16,25,19,0.08)]">
              {/* Sidebar */}
              <div className="flex">
                <div className="w-48 border-r border-white/10 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Search className="h-4 w-4 text-white/45" />
                    <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Search...</span>
                  </div>
                  <div className="space-y-1">
                    {[
                      { name: "Getting Started", active: false },
                      { name: "Architecture", active: true },
                      { name: "API Reference", active: false },
                      { name: "Deployment", active: false },
                    ].map((item, idx) => (
                      <div key={idx} className={`rounded-[2px] px-3 py-2 text-[13px] ${item.active ? "border-l-2 border-ledger-mint bg-white/[0.03] text-ledger-mint" : "text-white/55"}`}>
                        {item.name}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-display font-semibold">Architecture Overview</h3>
                    <div className="flex gap-2">
                      <button className="rounded-[2px] border border-white/12 p-1.5">
                        <Eye className="h-4 w-4 text-white/45" />
                      </button>
                      <button className="rounded-[2px] border border-white/12 p-1.5">
                        <Share2 className="h-4 w-4 text-white/45" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="h-4 w-full rounded-[2px] bg-white/10" />
                    <div className="h-4 w-5/6 rounded-[2px] bg-white/10" />
                    <div className="h-4 w-4/6 rounded-[2px] bg-white/10" />
                    <div className="mt-4 h-20 rounded-[2px] border-l-2 border-ledger-mint bg-white/[0.03] p-3">
                      {/* Braced string, not bare JSX text: `//` at the start of
                          children reads as a mistaken comment to both a linter
                          and a human. It is deliberate mock-code copy here. */}
                      <span className="font-brand-mono text-[11px] text-ledger-mint">{"// Code block preview"}</span>
                    </div>
                    <div className="mt-4 h-4 w-full rounded-[2px] bg-white/10" />
                    <div className="h-4 w-3/4 rounded-[2px] bg-white/10" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Real screenshot. The hero above is a hand-built mockup sized for a
          two-column layout; this is the surface as the app actually renders it,
          captured by e2e/tools/capture-marketing-shots.ts. */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-2xl">
            <div className="mb-4 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
              In the product
            </div>
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Docs the rest of the system can read.
            </h2>
            <p className="text-lg leading-relaxed text-ledger-ink/65">
              Runbooks, templates, and specs live next to the work they describe — and stay queryable by workflows and agents.
            </p>
          </div>
          <ProductShot
            src={docsShot}
            alt="Aexy docs workspace listing runbooks, templates, and documents with their metadata"
            figure="FIG. 01"
            caption="Docs workspace — runbooks and templates"
          />
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Documentation that works with you
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              Not just a wiki. A living knowledge base connected to your entire engineering operation.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <feature.icon className="mb-6 h-5 w-5 text-ledger-green" />
                <h3 className="mb-3 font-display text-xl font-semibold">{feature.title}</h3>
                <p className="text-ledger-ink/65">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                  <Sparkles className="h-3 w-3" />
                  AI-POWERED
                </div>
                <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  AI writing assistant
                </h2>
                <p className="mb-6 text-ledger-ink/65">
                  Generate documentation from code comments. Summarize long documents.
                  Get suggestions for improving clarity and completeness.
                </p>
                <ul className="space-y-3">
                  {[
                    "Auto-generate API docs from code",
                    "Summarize long documents",
                    "Suggest missing sections",
                    "Fix grammar and improve clarity",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-ledger-ink/75">
                      <span className="font-brand-mono leading-6 text-ledger-green">+</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* DARK PANE: the in-editor AI suggestion as the app renders it —
                  a genuine product mockup, white/* utilities intentional. */}
              <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
                <div className="mb-4 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-ledger-mint" />
                  <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">AI Suggestion</span>
                </div>
                <div className="rounded-[2px] border-l-2 border-ledger-mint bg-white/[0.03] p-4">
                  <p className="text-[13px] leading-6 text-white/85">
                    &ldquo;This section could benefit from a code example showing the authentication flow.
                    Would you like me to generate one based on your codebase?&rdquo;
                  </p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button className="rounded-[2px] bg-ledger-mint px-4 py-2 font-brand-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ledger-pane">Generate</button>
                  <button className="rounded-[2px] border border-white/20 px-4 py-2 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/60">Dismiss</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Build your engineering knowledge base
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            Documentation that stays connected to your work.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
            >
              <Github className="h-5 w-5" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

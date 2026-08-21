import Link from "next/link";
import { Metadata } from "next";
import { ArrowRight, BookOpen, Code2, Layers, Server, Sparkles, GitBranch, Users, Cpu } from "lucide-react";
import { DocsSearch } from "@/components/docs-site/DocsSearch";
import { getDocIndex, getSearchIndex } from "@/lib/docs";

export const metadata: Metadata = {
  // Bare string, not "… - Aexy": the root layout's title.template already
  // appends " | Aexy", so carrying the brand here rendered "Documentation -
  // Aexy | Aexy" in the SERP.
  title: "Documentation",
  description:
    "The Aexy AI company operating system, fully documented. Architecture, guides, API reference, and per-module deep dives.",
  alternates: { canonical: "/handbook" },
};

const SECTION_ICONS: Record<string, typeof BookOpen> = {
  "Architecture & Design": Layers,
  "API Reference": Code2,
  "Getting started & operations": Sparkles,
  "Developer guides (cross-cutting)": GitBranch,
  "Provider setup": Server,
  "Modules — Work & planning": BookOpen,
  "Modules — People": Users,
  "Modules — Customers": Sparkles,
  "Modules — AI & knowledge": Cpu,
  "Modules — Observability": Layers,
  "Modules — Communication": BookOpen,
  Testing: Code2,
};

export default function DocsHomePage() {
  const { sections } = getDocIndex();
  const searchEntries = getSearchIndex();
  const totalPages = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="relative">
      {/* Hero */}
      <section className="py-12 lg:py-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[2px] border border-ledger-ink/12 bg-ledger-card font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-green mb-6">
          <BookOpen className="h-4 w-4" />
          Documentation
        </div>
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-ledger-ink tracking-tight mb-4">
          Build with Aexy
        </h1>
        <p className="text-lg text-ledger-ink/60 max-w-2xl mb-8 leading-relaxed">
          The AI company operating system, fully documented. Architecture deep
          dives, cross-cutting guides, API conventions, and per-module references —
          {" "}
          <span className="text-ledger-ink/80">{totalPages} pages, all generated from the source repo.</span>
        </p>

        <div className="max-w-xl">
          <DocsSearch entries={searchEntries} variant="input" />
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href="/handbook/guides/getting-started"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[2px] bg-ledger-green text-ledger-paper font-semibold hover:bg-[#095A31] transition"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/handbook/architecture/system-architecture"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[2px] border border-ledger-ink/20 text-ledger-ink/80 hover:text-ledger-ink hover:border-ledger-ink/40 hover:bg-ledger-ink/[0.04] transition"
          >
            Architecture overview
          </Link>
          <a
            href="https://github.com/aexy-io/aexy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[2px] border border-ledger-ink/20 text-ledger-ink/80 hover:text-ledger-ink hover:border-ledger-ink/40 hover:bg-ledger-ink/[0.04] transition"
          >
            Source on GitHub
          </a>
        </div>
      </section>

      {/* Sections grid */}
      <section className="py-8 lg:py-12 space-y-12">
        {sections.map((section) => {
          const Icon = SECTION_ICONS[section.title] || BookOpen;
          return (
            <div key={section.title}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-[2px] bg-ledger-ink text-ledger-paper flex items-center justify-center">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <h2 className="font-display text-xl font-semibold text-ledger-ink tracking-tight">
                  {section.title}
                </h2>
                <span className="font-brand-mono text-xs text-ledger-ink/50">
                  {section.items.length} {section.items.length === 1 ? "page" : "pages"}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.items.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/handbook/${item.slug}`}
                    className="group p-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-card hover:bg-ledger-green/[0.04] hover:border-ledger-green/40 transition flex flex-col gap-1.5"
                  >
                    <span className="text-ledger-ink/90 font-medium text-[14.5px] group-hover:text-ledger-ink transition">
                      {item.title}
                    </span>
                    {item.description && (
                      <span className="text-ledger-ink/55 text-[13px] leading-snug line-clamp-2 group-hover:text-ledger-ink/70 transition">
                        {item.description}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

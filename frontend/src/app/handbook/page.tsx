import Link from "next/link";
import { Metadata } from "next";
import { ArrowRight, BookOpen, Code2, Layers, Server, Sparkles, GitBranch, Users, Cpu } from "lucide-react";
import { DocsSearch } from "@/components/docs-site/DocsSearch";
import { getDocIndex, getSearchIndex } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Documentation - Aexy",
  description:
    "The Aexy AI company operating system, fully documented. Architecture, guides, API reference, and per-module deep dives.",
};

const SECTION_ICONS: Record<string, { icon: typeof BookOpen; gradient: string }> = {
  "Architecture & Design": { icon: Layers, gradient: "from-blue-500 to-cyan-500" },
  "API Reference": { icon: Code2, gradient: "from-emerald-500 to-teal-500" },
  "Getting started & operations": { icon: Sparkles, gradient: "from-amber-500 to-orange-500" },
  "Developer guides (cross-cutting)": { icon: GitBranch, gradient: "from-violet-500 to-purple-500" },
  "Provider setup": { icon: Server, gradient: "from-rose-500 to-pink-500" },
  "Modules — Work & planning": { icon: BookOpen, gradient: "from-green-500 to-emerald-500" },
  "Modules — People": { icon: Users, gradient: "from-orange-500 to-rose-500" },
  "Modules — Customers": { icon: Sparkles, gradient: "from-purple-500 to-violet-500" },
  "Modules — AI & knowledge": { icon: Cpu, gradient: "from-indigo-500 to-blue-500" },
  "Modules — Observability": { icon: Layers, gradient: "from-cyan-500 to-blue-500" },
  "Modules — Communication": { icon: BookOpen, gradient: "from-pink-500 to-rose-500" },
  Testing: { icon: Code2, gradient: "from-slate-500 to-zinc-500" },
};

export default function DocsHomePage() {
  const { sections } = getDocIndex();
  const searchEntries = getSearchIndex();
  const totalPages = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="relative">
      {/* Hero */}
      <section className="py-12 lg:py-16">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500/20 to-purple-500/20 border border-primary-500/30 rounded-full text-primary-400 text-sm mb-6">
          <BookOpen className="h-4 w-4" />
          Documentation
        </div>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-4">
          Build with Aexy
        </h1>
        <p className="text-lg text-white/55 max-w-2xl mb-8 leading-relaxed">
          The AI company operating system, fully documented. Architecture deep
          dives, cross-cutting guides, API conventions, and per-module references —
          {" "}
          <span className="text-white/80">{totalPages} pages, all generated from the source repo.</span>
        </p>

        <div className="max-w-xl">
          <DocsSearch entries={searchEntries} variant="input" />
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href="/handbook/guides/getting-started"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/handbook/architecture/system-architecture"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 text-white/80 hover:text-white hover:border-white/30 hover:bg-white/[0.04] transition"
          >
            Architecture overview
          </Link>
          <a
            href="https://github.com/aexy-io/aexy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 text-white/80 hover:text-white hover:border-white/30 hover:bg-white/[0.04] transition"
          >
            Source on GitHub
          </a>
        </div>
      </section>

      {/* Sections grid */}
      <section className="py-8 lg:py-12 space-y-12">
        {sections.map((section) => {
          const meta = SECTION_ICONS[section.title] || {
            icon: BookOpen,
            gradient: "from-slate-500 to-zinc-500",
          };
          const Icon = meta.icon;
          return (
            <div key={section.title}>
              <div className="flex items-center gap-3 mb-5">
                <div
                  className={`w-9 h-9 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shadow-lg`}
                >
                  <Icon className="h-4.5 w-4.5 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-white tracking-tight">
                  {section.title}
                </h2>
                <span className="text-xs text-white/30">
                  {section.items.length} {section.items.length === 1 ? "page" : "pages"}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.items.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/handbook/${item.slug}`}
                    className="group p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-primary-500/20 transition flex flex-col gap-1.5"
                  >
                    <span className="text-white/90 font-medium text-[14.5px] group-hover:text-white transition">
                      {item.title}
                    </span>
                    {item.description && (
                      <span className="text-white/45 text-[13px] leading-snug line-clamp-2 group-hover:text-white/55 transition">
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

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
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: PenLine,
    title: "Rich Text Editor",
    description: "Markdown and WYSIWYG editing. Code blocks with syntax highlighting, tables, and embeds.",
    color: "from-indigo-500 to-blue-500",
  },
  {
    icon: FolderTree,
    title: "Organized by Default",
    description: "Hierarchical structure with folders and tags. Find any document instantly with powerful search.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: Link2,
    title: "Linked to Everything",
    description: "Connect docs to tickets, PRs, epics, and team members. Build a living knowledge base.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: History,
    title: "Version History",
    description: "Full revision history with diffs. Restore previous versions with one click.",
    color: "from-amber-500 to-orange-500",
  },
];

export default function DocsProductPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500/20 to-blue-500/20 border border-indigo-500/30 rounded-full text-indigo-400 text-sm mb-6">
                <FileText className="h-4 w-4" />
                <span>Documentation</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Documentation that{" "}
                <span className="bg-gradient-to-r from-indigo-400 to-blue-400 bg-clip-text text-transparent">
                  stays current
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                Write docs that connect to your code and work. Version-controlled,
                searchable, and always linked to the right context.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-500 to-blue-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(99,102,241,0.3)]"
                >
                  Start Writing Free
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </a>
                <Link
                  href="/manifesto"
                  className="group inline-flex items-center justify-center gap-2 bg-white/5 text-white px-8 py-4 rounded-full text-lg font-medium border border-white/10 hover:border-white/20 transition-all"
                >
                  Learn More
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-white/40">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500" />
                  Markdown support
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500" />
                  Real-time collaboration
                </span>
              </div>
            </div>

            {/* Visual - Doc Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-blue-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                {/* Sidebar */}
                <div className="flex">
                  <div className="w-48 p-4 border-r border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2 mb-4">
                      <Search className="h-4 w-4 text-white/40" />
                      <span className="text-white/40 text-sm">Search...</span>
                    </div>
                    <div className="space-y-1">
                      {[
                        { name: "Getting Started", active: false },
                        { name: "Architecture", active: true },
                        { name: "API Reference", active: false },
                        { name: "Deployment", active: false },
                      ].map((item, idx) => (
                        <div key={idx} className={`px-3 py-2 rounded-lg text-sm ${item.active ? "bg-indigo-500/20 text-indigo-400" : "text-white/50 hover:text-white/70"}`}>
                          {item.name}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Content */}
                  <div className="flex-1 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-white font-semibold">Architecture Overview</h3>
                      <div className="flex gap-2">
                        <button className="p-1.5 bg-white/5 rounded">
                          <Eye className="h-4 w-4 text-white/40" />
                        </button>
                        <button className="p-1.5 bg-white/5 rounded">
                          <Share2 className="h-4 w-4 text-white/40" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-4 bg-white/10 rounded w-full" />
                      <div className="h-4 bg-white/10 rounded w-5/6" />
                      <div className="h-4 bg-white/10 rounded w-4/6" />
                      <div className="h-20 bg-indigo-500/10 border border-indigo-500/20 rounded-lg mt-4 p-3">
                        <span className="text-indigo-400 text-xs font-mono">// Code block preview</span>
                      </div>
                      <div className="h-4 bg-white/10 rounded w-full mt-4" />
                      <div className="h-4 bg-white/10 rounded w-3/4" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Documentation that works with you
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Not just a wiki. A living knowledge base connected to your entire engineering operation.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, idx) => (
              <div key={idx} className="group relative">
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} rounded-3xl opacity-0 group-hover:opacity-10 blur-xl transition-all duration-500`} />
                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all h-full">
                  <div className={`p-4 bg-gradient-to-br ${feature.color} rounded-2xl w-fit mb-6`}>
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                  <p className="text-white/60">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 rounded-full text-indigo-400 text-xs mb-4">
                    <Sparkles className="h-3 w-3" />
                    AI-POWERED
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    AI writing assistant
                  </h2>
                  <p className="text-white/60 mb-6">
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
                      <li key={idx} className="flex items-center gap-3 text-white/70">
                        <CheckCircle2 className="h-5 w-5 text-indigo-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <Sparkles className="h-5 w-5 text-indigo-400" />
                    <span className="text-white font-medium">AI Suggestion</span>
                  </div>
                  <div className="p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                    <p className="text-white/80 text-sm">
                      &ldquo;This section could benefit from a code example showing the authentication flow.
                      Would you like me to generate one based on your codebase?&rdquo;
                    </p>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button className="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg font-medium">Generate</button>
                    <button className="px-4 py-2 bg-white/10 text-white/60 text-sm rounded-lg">Dismiss</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Build your engineering knowledge base
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Documentation that stays connected to your work.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-500 to-blue-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              <Github className="h-5 w-5" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

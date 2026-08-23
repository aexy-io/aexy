"use client";

import Link from "next/link";
import {
  ArrowRight,
  Ticket,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Zap,
  Filter,
  Tag,
  MessageSquare,
  Link2,
  Bell,
  Workflow,
  Bot,
  ArrowUpRight,
  CircleDot,
  Github,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { ProductShot } from "@/components/marketing/ProductShot";
import ticketsShot from "../../../../public/marketing/products/tickets@2x.webp";


const features = [
  {
    icon: Workflow,
    title: "Custom Workflows",
    description: "Define your own ticket statuses and transitions. Build workflows that match how your team actually works.",
  },
  {
    icon: Link2,
    title: "Deep Linking",
    description: "Link tickets to PRs, commits, epics, and sprints. Everything connected, nothing lost.",
  },
  {
    icon: Bot,
    title: "AI Triage",
    description: "Automatic priority assignment, duplicate detection, and smart routing to the right team.",
  },
  {
    icon: Bell,
    title: "Smart Notifications",
    description: "Get notified about what matters. Customizable alerts based on priority, assignee, or label changes.",
  },
];

const ticketTypes = [
  { name: "Bug", icon: AlertCircle },
  { name: "Feature", icon: Zap },
  { name: "Task", icon: CheckCircle2 },
  { name: "Epic", icon: CircleDot },
];

export default function TicketsProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Ticket className="h-4 w-4" />
                <span>Issue Tracking</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Ticketing that{" "}
                <span className="text-ledger-green">developers love</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                Fast, flexible issue tracking built for engineering teams.
                Keyboard-first, deeply integrated with your code, and powered by AI for smart routing.
              </p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  Start Tracking Free
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
                  Keyboard shortcuts
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  GitHub integration
                </span>
              </div>
            </div>

            {/* Visual - Ticket List Preview.

                DARK PANE: this is a genuine product mockup — the ticket list as
                the app renders it — so it keeps the plate treatment used for
                product UI on the paper page (see OsConsolePreview): ledger-pane
                ground, white-opacity type, ledger-mint as the only accent. The
                white/* utilities below are scoped to this pane on purpose. */}
            <div className="overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane text-[#E6EDE7] shadow-[0_1px_0_rgba(16,25,19,0.08)]">
              {/* Toolbar */}
              <div className="flex items-center gap-3 border-b border-white/10 p-4">
                <div className="flex items-center gap-2 rounded-[2px] border border-white/12 px-3 py-1.5">
                  <Filter className="h-4 w-4 text-white/45" />
                  <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Filter</span>
                </div>
                <div className="flex gap-2">
                  {ticketTypes.map((type, idx) => (
                    <span key={idx} className="flex items-center gap-1 rounded-[2px] border border-white/12 px-2 py-1">
                      <type.icon className="h-3 w-3 text-ledger-mint" />
                      <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">{type.name}</span>
                    </span>
                  ))}
                </div>
              </div>
              {/* Ticket List */}
              <div className="divide-y divide-white/10">
                {[
                  { id: "AEXY-234", title: "Fix login redirect loop", type: "Bug", priority: "High", assignee: "SM" },
                  { id: "AEXY-235", title: "Add dark mode toggle", type: "Feature", priority: "Medium", assignee: "JD" },
                  { id: "AEXY-236", title: "Update API documentation", type: "Task", priority: "Low", assignee: "AK" },
                  { id: "AEXY-237", title: "Refactor authentication module", type: "Epic", priority: "High", assignee: "SM" },
                ].map((ticket, idx) => (
                  <div key={idx} className="flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-white/[0.03]">
                    <div className={`h-2 w-2 rounded-full ${ticket.priority === "High" ? "bg-ledger-mint" : ticket.priority === "Medium" ? "bg-white/45" : "bg-white/20"}`} />
                    <span className="font-brand-mono text-xs text-white/50">{ticket.id}</span>
                    <span className="flex-1 text-[13px] text-white/85">{ticket.title}</span>
                    <span className="rounded-[2px] border border-white/12 px-2 py-0.5 font-brand-mono text-[10px] uppercase tracking-[0.14em] text-white/60">
                      {ticket.type}
                    </span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-[2px] border border-white/12 font-brand-mono text-[11px] text-white/70">
                      {ticket.assignee}
                    </div>
                  </div>
                ))}
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
              Every ticket, with the clock running.
            </h2>
            <p className="text-lg leading-relaxed text-ledger-ink/65">
              Service desk turns an email thread into a ticket, routes it to the team that owns it, and shows how long each one has been sitting with them.
            </p>
          </div>
          <ProductShot
            src={ticketsShot}
            alt="Aexy service desk showing open tickets grouped by stakeholder, with working days in stage and overall age for each ticket"
            figure="FIG. 01"
            caption="Service desk — open tickets by stakeholder and age"
          />
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Everything you need to track work
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              Powerful enough for complex projects, simple enough for everyday use.
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

      {/* Keyboard First */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Keyboard-first experience
                </h2>
                <p className="mb-6 text-ledger-ink/65">
                  Navigate, search, and manage tickets without touching your mouse.
                  Built for developers who value speed.
                </p>
                <div className="space-y-3">
                  {[
                    { key: "C", action: "Create new ticket" },
                    { key: "/", action: "Quick search" },
                    { key: "G I", action: "Go to inbox" },
                    { key: "A", action: "Assign ticket" },
                  ].map((shortcut, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <kbd className="rounded-[2px] border border-ledger-ink/25 bg-ledger-paper px-3 py-1.5 font-brand-mono text-sm text-ledger-ink">
                        {shortcut.key}
                      </kbd>
                      <span className="text-ledger-ink/65">{shortcut.action}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-center">
                <div className="inline-flex items-center gap-2 rounded-[2px] border border-ledger-ink/12 bg-ledger-paper px-6 py-3">
                  <span className="font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/50">Press</span>
                  <kbd className="rounded-[2px] border border-ledger-ink/25 bg-ledger-card px-3 py-1.5 font-brand-mono text-sm text-ledger-ink">?</kbd>
                  <span className="font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/50">for all shortcuts</span>
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
            Start tracking issues the right way
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            Fast, flexible, and built for engineering teams.
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

"use client";

import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Layers,
  CheckCircle2,
  Kanban,
  TrendingUp,
  Bot,
  Sparkles,
  GitPullRequest,
  Github,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { ProductShot } from "@/components/marketing/ProductShot";
import boardShot from "../../../../public/marketing/home/home-build@2x.webp";


const features = [
  {
    icon: Kanban,
    title: "Visual Sprint Planning",
    description: "Drag-and-drop kanban boards. Plan sprints visually with real capacity data from your team.",
  },
  {
    icon: Layers,
    title: "Epic & Initiative Tracking",
    description: "Create epics spanning multiple sprints. Track progress across projects with automatic rollups.",
  },
  {
    icon: Bot,
    title: "AI Task Assignment",
    description: "Intelligent task matching based on developer skills and current workload. Never over-allocate again.",
  },
  {
    icon: TrendingUp,
    title: "Velocity Analytics",
    description: "Track sprint velocity, predict completion dates, and identify patterns over time.",
  },
];

const integrations = [
  { name: "Jira", desc: "Two-way sync with Jira projects" },
  { name: "Linear", desc: "Native Linear integration" },
  { name: "GitHub Issues", desc: "Sync with GitHub Issues" },
  { name: "Asana", desc: "Import from Asana" },
];

export default function PlanningProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Calendar className="h-4 w-4" />
                <span>Sprint Planning</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Planning that{" "}
                <span className="text-ledger-green">reflects reality</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                Sprint planning powered by real team capacity. AI-driven task assignment.
                Automatic sync with GitHub, Jira, and Linear. No more guessing games.
              </p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  Start Planning Free
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
                  Import from Jira/Linear
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  AI capacity planning
                </span>
              </div>
            </div>

            {/* Visual - Kanban Preview.

                DARK PANE: a genuine product mockup — the sprint board as the app
                renders it — so it keeps the plate treatment used for product UI
                on the paper page (see OsConsolePreview): ledger-pane ground,
                white-opacity type, ledger-mint as the only accent. The white/*
                utilities below are intentional inside bg-ledger-pane. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="font-medium">Sprint 24 - Mobile App</h3>
                <span className="rounded-[2px] bg-ledger-mint/15 px-3 py-1 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">
                  67% Complete
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { title: "To Do", tasks: [{ name: "API endpoints", tag: "Backend" }, { name: "Tests", tag: "QA" }] },
                  { title: "In Progress", tasks: [{ name: "Dashboard UI", tag: "Frontend" }] },
                  { title: "Done", tasks: [{ name: "Auth flow", tag: "Backend" }, { name: "Login page", tag: "Frontend" }] },
                ].map((col, idx) => (
                  <div key={idx} className="space-y-3">
                    <div className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/50">{col.title}</div>
                    {col.tasks.map((task, tidx) => (
                      <div key={tidx} className="rounded-[2px] border border-white/12 p-3">
                        <p className="mb-2 text-[13px] text-white/85">{task.name}</p>
                        <span className={`rounded-[2px] px-2 py-0.5 font-brand-mono text-[10px] uppercase tracking-[0.14em] ${idx === 2 ? "bg-ledger-mint/15 text-ledger-mint" : "border border-white/12 text-white/55"}`}>
                          {task.tag}
                        </span>
                      </div>
                    ))}
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
              The board your sprint actually runs on.
            </h2>
            <p className="text-lg leading-relaxed text-ledger-ink/65">
              Tasks move across the columns your workspace defines, linked to the commits and pull requests that closed them.
            </p>
          </div>
          <ProductShot
            src={boardShot}
            alt="Aexy sprint board showing tasks in todo, in progress, and in review columns with a sprint goal"
            figure="FIG. 01"
            caption="Sprint board — tasks across status columns"
          />
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Planning that actually works
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              Built by engineering leaders who were tired of plans that never matched reality.
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

      {/* AI Assignment */}
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
                  Smart task assignment
                </h2>
                <p className="mb-6 text-ledger-ink/65">
                  Our AI analyzes developer skills from their actual code contributions and matches tasks to the best-suited team members automatically.
                </p>
                <ul className="space-y-3">
                  {[
                    "Matches tasks to developer expertise",
                    "Balances workload across the team",
                    "Suggests optimal sprint capacity",
                    "Learns from historical patterns",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-ledger-ink/75">
                      <span className="font-brand-mono text-base leading-none text-ledger-green">+</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* DARK PANE: the in-product AI suggestion card, rendered as the app
                  shows it. The white/* utilities are intentional inside bg-ledger-pane. */}
              <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
                <div className="mb-4 flex items-center gap-3">
                  <Bot className="h-5 w-5 text-ledger-mint" />
                  <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">AI Suggestion</span>
                </div>
                <div className="mb-4 border-l-2 border-ledger-mint bg-white/[0.03] px-3.5 py-3">
                  <p className="text-sm leading-6 text-white/85">
                    &ldquo;Assign <span className="text-ledger-mint">API refactoring</span> to <span className="text-ledger-mint">Sarah</span> -
                    95% match based on Node.js expertise and current capacity.&rdquo;
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-[2px] bg-ledger-mint px-4 py-2 text-sm font-medium text-ledger-pane">Accept</button>
                  <button className="rounded-[2px] border border-white/12 px-4 py-2 text-sm text-white/60">Dismiss</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Works with your existing tools
            </h2>
            <p className="text-ledger-ink/55">Import from anywhere, sync everywhere.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {integrations.map((int, idx) => (
              <div
                key={idx}
                className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 text-center transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <GitPullRequest className="mx-auto mb-3 h-5 w-5 text-ledger-green" />
                <h3 className="mb-1 font-medium">{int.name}</h3>
                <p className="font-brand-mono text-[11px] leading-5 text-ledger-ink/55">{int.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Transform your sprint planning
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            Import a Jira or Linear project and plan your next sprint against real capacity.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
            >
              Start Planning Free
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

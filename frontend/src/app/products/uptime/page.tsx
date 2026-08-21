"use client";

import Link from "next/link";
import {
  ArrowRight,
  MonitorCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe,
  Bell,
  Ticket,
  Activity,
  Github,
  Wifi,
  Server,
  Lock,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";


const features = [
  {
    icon: Globe,
    title: "Multi-Protocol Monitoring",
    description: "Monitor HTTP endpoints, TCP ports, and WebSocket connections. Verify SSL certificates and track response times.",
  },
  {
    icon: Ticket,
    title: "Auto-Ticketing",
    description: "Automatically create support tickets when incidents occur. Auto-close tickets when services recover.",
  },
  {
    icon: Bell,
    title: "Smart Alerts",
    description: "Get notified via Slack, email, or webhooks. Configure thresholds to avoid false positives.",
  },
  {
    icon: Activity,
    title: "Uptime Reports",
    description: "Track uptime percentages, response times, and incident history. Export reports for SLA compliance.",
  },
];

const checkTypes = [
  { name: "HTTP", icon: Globe },
  { name: "TCP", icon: Server },
  { name: "WebSocket", icon: Wifi },
  { name: "SSL", icon: Lock },
];

export default function UptimeProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <MonitorCheck className="h-4 w-4" />
                <span>Uptime Monitoring</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Know when your{" "}
                <span className="text-ledger-green">services go down</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                Monitor endpoints, get instant alerts, and automatically create tickets.
                Keep your services healthy with real-time monitoring built for engineering teams.
              </p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  Start Monitoring Free
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
                  1-minute checks
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Auto-ticketing
                </span>
              </div>
            </div>

            {/* Visual - Monitor Dashboard Preview.

                DARK PANE: a genuine product mockup — the monitor list as the app
                renders it — so it keeps the plate treatment used for product UI
                on the paper page (see OsConsolePreview): ledger-pane ground,
                white-opacity type, ledger-mint reserved for healthy services.
                The white/* utilities below are intentional inside
                bg-ledger-pane. */}
            <div className="overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane text-[#E6EDE7]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    {checkTypes.map((type, idx) => (
                      <span key={idx} className="flex items-center gap-1 rounded-[2px] border border-white/12 px-2 py-1">
                        <type.icon className="h-3 w-3 text-ledger-mint" />
                        <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">{type.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ledger-mint" />
                  Live
                </div>
              </div>
              {/* Monitor List */}
              <div className="divide-y divide-white/10">
                {[
                  { name: "API Production", type: "HTTP", status: "up", uptime: "99.98%", responseTime: "142ms" },
                  { name: "Database Primary", type: "TCP", status: "up", uptime: "100%", responseTime: "12ms" },
                  { name: "WebSocket Gateway", type: "WebSocket", status: "up", uptime: "99.95%", responseTime: "89ms" },
                  { name: "Auth Service", type: "HTTP", status: "down", uptime: "98.5%", responseTime: "-" },
                ].map((monitor, idx) => (
                  <div key={idx} className="flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-white/[0.03]">
                    <div className={`h-2 w-2 rounded-full ${monitor.status === "up" ? "bg-ledger-mint" : "animate-pulse bg-white/70"}`} />
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-white/85">{monitor.name}</span>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-[2px] border border-white/12 px-1.5 py-0.5 font-brand-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
                          {monitor.type}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`font-brand-mono text-xs ${monitor.status === "up" ? "text-ledger-mint" : "text-white/85"}`}>
                        {monitor.uptime}
                      </span>
                      <p className="font-brand-mono text-[11px] text-white/50">{monitor.responseTime}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Everything you need for reliable monitoring
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              From simple HTTP checks to complex incident management with automatic ticketing.
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

      {/* How It Works */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Automatic incident management
                </h2>
                <p className="mb-6 text-ledger-ink/65">
                  When your service goes down, we automatically create a ticket and notify your team.
                  When it recovers, we close the ticket with a full timeline.
                </p>
                <div className="space-y-4">
                  {[
                    { step: "1", title: "Monitor detects failure", desc: "Consecutive checks fail" },
                    { step: "2", title: "Incident created", desc: "Ticket auto-generated" },
                    { step: "3", title: "Team notified", desc: "Slack, email, webhook" },
                    { step: "4", title: "Service recovers", desc: "Ticket auto-closed" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-4">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[2px] border border-ledger-ink/25 bg-ledger-paper font-brand-mono text-sm text-ledger-green">
                        {item.step}
                      </div>
                      <div>
                        <h4 className="font-medium">{item.title}</h4>
                        <p className="text-sm text-ledger-ink/55">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-center">
                <div className="inline-flex flex-col items-center gap-3 rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-6">
                  <AlertTriangle className="h-8 w-8 text-ledger-red" />
                  <div className="font-medium">Incident Detected</div>
                  <div className="flex items-center gap-2 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/55">
                    <Clock className="h-4 w-4" />
                    Auto-ticket in 3 failures
                  </div>
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
            Start monitoring your services today
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            Free for up to 10 monitors. No credit card required.
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

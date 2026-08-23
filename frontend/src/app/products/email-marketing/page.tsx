"use client";

import Link from "next/link";
import {
  ArrowRight,
  Mail,
  CheckCircle2,
  Sparkles,
  Bot,
  TrendingUp,
  Target,
  BarChart3,
  MousePointer,
  Eye,
  Layers,
  Palette,
  Send,
  Users,
  Zap,
  Shield,
  Globe,
  Settings,
  Github,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";


const features = [
  {
    icon: Palette,
    title: "Visual Email Builder",
    description: "Drag-and-drop email creation with 16+ block types. Hero sections, buttons, social links, and dynamic content.",
  },
  {
    icon: BarChart3,
    title: "Full Analytics",
    description: "Track opens, clicks, bounces, and conversions. Device breakdown, ISP metrics, and AI-powered send time optimization.",
  },
  {
    icon: Globe,
    title: "Multi-Domain Sending",
    description: "Route emails through multiple domains and providers. Automatic failover and smart ISP-based routing.",
  },
  {
    icon: Zap,
    title: "IP Warming Automation",
    description: "AI-driven warming schedules. Conservative, moderate, or aggressive plans with automatic health monitoring.",
  },
];

const campaignTypes = [
  { name: "Product Updates", sent: "12.5K", opens: "45%", clicks: "12%" },
  { name: "User Onboarding", sent: "8.2K", opens: "62%", clicks: "28%" },
  { name: "Release Notes", sent: "5.1K", opens: "38%", clicks: "8%" },
];

const trackingFeatures = [
  { icon: Eye, label: "Open Tracking", desc: "1x1 pixel with device detection" },
  { icon: MousePointer, label: "Click Tracking", desc: "Link-level analytics" },
  { icon: Users, label: "Preference Center", desc: "GDPR-compliant opt-outs" },
  { icon: Shield, label: "Reputation Guard", desc: "Auto-pause on poor health" },
];

export default function EmailMarketingProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Mail className="h-4 w-4" />
                <span>Email Marketing</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Campaigns{" "}
                <span className="text-ledger-green">that convert</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                Email marketing built for modern teams. Visual builder, full tracking,
                multi-domain infrastructure, and AI-powered warming.
                Enterprise-grade deliverability without the complexity.
              </p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  Start Sending Free
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
                  Visual drag-and-drop
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Multi-provider routing
                </span>
              </div>
            </div>

            {/* Visual - Campaign Dashboard Preview.

                DARK PANE: a genuine product mockup — the campaign dashboard as
                the app renders it — so it keeps the plate treatment used for
                product UI on the paper page (see OsConsolePreview): ledger-pane
                ground, white-opacity type, ledger-mint as the only accent. The
                white/* utilities below are scoped to this pane on purpose. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7] shadow-[0_1px_0_rgba(16,25,19,0.08)]">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="font-display font-medium">Recent Campaigns</h3>
                <button className="flex items-center gap-1 rounded-[2px] border border-white/12 px-3 py-1 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">
                  <Send className="h-3 w-3" />
                  New Campaign
                </button>
              </div>

              {/* Campaign List */}
              <div className="mb-6 space-y-3">
                {campaignTypes.map((campaign, idx) => (
                  <div key={idx} className="flex cursor-pointer items-center gap-4 rounded-[2px] border border-white/12 p-3 transition-colors hover:bg-white/[0.03]">
                    <Mail className="h-5 w-5 text-ledger-mint" />
                    <div className="flex-1">
                      <p className="text-[13px] font-medium text-white/85">{campaign.name}</p>
                      <p className="font-brand-mono text-[11px] text-white/50">{campaign.sent} sent</p>
                    </div>
                    <div className="flex items-center gap-4 font-brand-mono text-[11px]">
                      <span className="text-ledger-mint">{campaign.opens} opens</span>
                      <span className="text-white/60">{campaign.clicks} clicks</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Sent", value: "25.8K" },
                  { label: "Avg Open Rate", value: "48.3%" },
                  { label: "Avg Click Rate", value: "16.1%" },
                ].map((stat, idx) => (
                  <div key={idx} className="rounded-[2px] border border-white/12 p-3 text-center">
                    <p className="font-brand-mono text-base text-white">{stat.value}</p>
                    <p className="mt-1 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/50">{stat.label}</p>
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
              Everything you need to send at scale
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              From visual design to deliverability infrastructure. Built for teams who care about results.
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

      {/* Visual Builder */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Palette className="h-3 w-3" />
                VISUAL BUILDER
              </div>
              <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                Design emails without code
              </h2>
              <p className="mb-6 text-ledger-ink/65">
                Drag and drop blocks to create beautiful emails. 16+ block types including
                headers, buttons, hero sections, and dynamic content with Jinja2 variables.
              </p>
              <ul className="space-y-3">
                {[
                  "Layout blocks: containers, sections, columns",
                  "Content blocks: text, images, buttons, links",
                  "Rich blocks: hero, footer, social, testimonials",
                  "Dynamic: variables, conditionals, loops",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-ledger-ink/75">
                    <span className="font-brand-mono leading-6 text-ledger-green">+</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* DARK PANE: the builder's block library as the app renders it —
                a genuine product mockup, white/* utilities intentional. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
              <div className="mb-4 flex items-center gap-3">
                <Layers className="h-5 w-5 text-ledger-mint" />
                <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Block Library</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "Header", icon: "H1" },
                  { name: "Text", icon: "T" },
                  { name: "Image", icon: "IMG" },
                  { name: "Button", icon: "BTN" },
                  { name: "Divider", icon: "—" },
                  { name: "Spacer", icon: "↕" },
                  { name: "Hero", icon: "★" },
                  { name: "Footer", icon: "©" },
                  { name: "Social", icon: "@" },
                ].map((block, idx) => (
                  <div key={idx} className="cursor-pointer rounded-[2px] border border-white/12 p-3 text-center transition-colors hover:bg-white/[0.03]">
                    <div className="mb-1 font-brand-mono text-base text-ledger-mint">{block.icon}</div>
                    <p className="font-brand-mono text-[11px] text-white/50">{block.name}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tracking & Analytics */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <div className="mb-10 text-center">
              <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                Full-funnel tracking & analytics
              </h2>
              <p className="text-ledger-ink/65">
                Know exactly how your emails perform. From sends to conversions.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              {trackingFeatures.map((item, idx) => (
                <div key={idx} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-6 text-center">
                  <item.icon className="mx-auto mb-3 h-5 w-5 text-ledger-green" />
                  <h3 className="mb-1 font-display font-semibold">{item.label}</h3>
                  <p className="font-brand-mono text-[11px] text-ledger-ink/55">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Infrastructure */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid items-center gap-8 md:grid-cols-2">
            {/* DARK PANE: the sending-infrastructure console as the app renders
                it — a genuine product mockup, white/* utilities intentional. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
              <div className="mb-4 flex items-center gap-3">
                <Globe className="h-5 w-5 text-ledger-mint" />
                <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Sending Infrastructure</span>
              </div>
              <div className="space-y-3">
                {[
                  { domain: "mail.example.com", status: "Active", health: "98%", dot: "bg-ledger-mint", tone: "text-ledger-mint" },
                  { domain: "send.company.io", status: "Warming", health: "Day 7/14", dot: "bg-white/45", tone: "text-white/60" },
                  { domain: "notify.app.dev", status: "Active", health: "95%", dot: "bg-ledger-mint", tone: "text-ledger-mint" },
                ].map((domain, idx) => (
                  <div key={idx} className="flex items-center gap-4 rounded-[2px] border border-white/12 p-3">
                    <div className={`h-2 w-2 rounded-full ${domain.dot}`} />
                    <div className="flex-1">
                      <p className="font-brand-mono text-[13px] text-white/85">{domain.domain}</p>
                      <p className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/50">{domain.status}</p>
                    </div>
                    <span className={`font-brand-mono text-[13px] ${domain.tone}`}>{domain.health}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-4 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Settings className="h-3 w-3" />
                INFRASTRUCTURE
              </div>
              <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                Enterprise-grade deliverability
              </h2>
              <p className="mb-6 text-ledger-ink/65">
                Multi-domain sending with automatic warming, health monitoring, and smart routing.
                Connect SES, SendGrid, Mailgun, or Postmark.
              </p>
              <ul className="space-y-3">
                {[
                  "Multiple sending domains & IPs",
                  "AI-driven warming schedules",
                  "ISP-specific routing (Gmail, Outlook, Yahoo)",
                  "Auto-pause on reputation issues",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-ledger-ink/75">
                    <span className="font-brand-mono leading-6 text-ledger-green">+</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Ready to send emails that get results?
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            Start with the visual builder. Scale with enterprise infrastructure.
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

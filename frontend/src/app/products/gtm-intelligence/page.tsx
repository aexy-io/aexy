"use client";

import Link from "next/link";
import {
  ArrowRight,
  Crosshair,
  CheckCircle2,
  Eye,
  Building2,
  Users,
  TrendingUp,
  Zap,
  Globe,
  Shield,
  BarChart3,
  Target,
  Mail,
  Plug,
  Layers,
  Activity,
  Github,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Eye,
    title: "Visitor Identification",
    description: "Turn anonymous website traffic into named accounts. IP-to-company resolution powered by Snitcher with automatic CRM matching.",
    color: "from-indigo-500 to-violet-500",
  },
  {
    icon: TrendingUp,
    title: "Lead Scoring & ICP Matching",
    description: "Multi-factor scoring: firmographic (40%), behavioral (35%), engagement (25%). Configurable ICP templates with lifecycle stage automation.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Plug,
    title: "10-Slot Provider Registry",
    description: "Hot-swap any integration without code changes. Snitcher, Apollo, MillionVerifier, PhantomBuster, Twilio, and more. Your stack, your rules.",
    color: "from-amber-500 to-orange-500",
  },
  {
    icon: Activity,
    title: "Real-Time Event Pipeline",
    description: "Lightweight tracking pixel captures page views, scroll depth, UTMs, and time-on-page. Temporal-powered processing with sub-second latency.",
    color: "from-sky-500 to-blue-500",
  },
];

const providerSlots = [
  { slot: "Visitor Identification", provider: "Snitcher", cost: "$39/mo", status: "Default" },
  { slot: "Email Verification", provider: "MillionVerifier", cost: "$16/mo", status: "Default" },
  { slot: "Contact Enrichment", provider: "Apollo.io", cost: "$49/mo", status: "Optional" },
  { slot: "LinkedIn Automation", provider: "PhantomBuster", cost: "$56/mo", status: "Optional" },
  { slot: "SMS / Phone", provider: "Twilio", cost: "$50/mo", status: "Optional" },
  { slot: "Intent Data", provider: "Bombora", cost: "$80/mo", status: "Optional" },
];

const funnelStages = [
  { stage: "Visitors", count: "12,480", color: "indigo" },
  { stage: "Identified", count: "3,120", color: "violet" },
  { stage: "Leads", count: "890", color: "purple" },
  { stage: "MQL", count: "340", color: "fuchsia" },
  { stage: "SQL", count: "120", color: "pink" },
  { stage: "Opportunity", count: "45", color: "rose" },
];

const trackingCapabilities = [
  { icon: Eye, label: "Page Views", desc: "Automatic tracking with SPA support" },
  { icon: Target, label: "UTM Capture", desc: "Source, medium, campaign attribution" },
  { icon: Activity, label: "Scroll Depth", desc: "10%, 25%, 50%, 75%, 90% milestones" },
  { icon: Shield, label: "Privacy-First", desc: "Cookie consent, GDPR-compliant" },
];

export default function GTMIntelligenceProductPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 rounded-full text-indigo-400 text-sm mb-6">
                <Crosshair className="h-4 w-4" />
                <span>GTM Intelligence</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Know who&apos;s on{" "}
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                  your website
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                Visitor identification, company enrichment, lead scoring, and
                multi-channel outreach — all in one platform.
                Turn anonymous traffic into qualified pipeline.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(99,102,241,0.3)]"
                >
                  Start Identifying Visitors
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
                  From $55/mo total
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500" />
                  Swap any provider
                </span>
              </div>
            </div>

            {/* Visual - GTM Dashboard Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-violet-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white font-medium">Visitor Funnel</h3>
                  <span className="px-3 py-1 bg-indigo-500/20 text-indigo-400 text-xs rounded-full">Live</span>
                </div>

                {/* Funnel Visualization */}
                <div className="space-y-3 mb-6">
                  {funnelStages.map((stage, idx) => {
                    const maxCount = 12480;
                    const count = parseInt(stage.count.replace(",", ""));
                    const width = Math.max((count / maxCount) * 100, 8);
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-white/70">{stage.stage}</span>
                          <span className="text-white font-semibold">{stage.count}</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2.5">
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2.5 rounded-full transition-all duration-700"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Identified", value: "25%", color: "indigo" },
                    { label: "Conversion", value: "3.6%", color: "emerald" },
                    { label: "Avg Score", value: "68", color: "violet" },
                  ].map((stat, idx) => (
                    <div key={idx} className="p-3 bg-white/5 rounded-xl text-center">
                      <p className="text-white text-lg font-bold">{stat.value}</p>
                      <p className="text-white/40 text-xs">{stat.label}</p>
                    </div>
                  ))}
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
              Full-stack go-to-market intelligence
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              From anonymous visitor to closed deal. Every stage automated, every signal captured.
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

      {/* Provider Registry */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 rounded-full text-amber-400 text-xs mb-4">
                <Plug className="h-3 w-3" />
                PLUGGABLE ARCHITECTURE
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Your stack, your rules
              </h2>
              <p className="text-white/60 mb-6">
                10 provider slots, each hot-swappable without code changes.
                Start with Snitcher + MillionVerifier at $55/mo. Scale to a full
                enterprise stack when you&apos;re ready.
              </p>
              <ul className="space-y-3">
                {[
                  "Hot-swap providers without downtime",
                  "Automatic fallback chains",
                  "Per-provider usage tracking & cost monitoring",
                  "Test connection before going live",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-white/70">
                    <CheckCircle2 className="h-5 w-5 text-amber-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <Layers className="h-5 w-5 text-amber-400" />
                <span className="text-white font-medium">Provider Registry</span>
              </div>
              <div className="space-y-2">
                {providerSlots.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                    <div className={`w-2 h-2 rounded-full ${slot.status === "Default" ? "bg-emerald-400" : "bg-zinc-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{slot.slot}</p>
                      <p className="text-white/40 text-xs">{slot.provider}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-white/60 text-sm">{slot.cost}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-white/40 text-sm">Base stack</span>
                <span className="text-emerald-400 font-semibold">$55/mo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tracking Pixel */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-violet-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="text-center mb-10">
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  One script tag. Full visibility.
                </h2>
                <p className="text-white/60">
                  Drop a single &lt;script&gt; tag and start capturing visitor behavior instantly.
                </p>
              </div>

              {/* Code snippet */}
              <div className="max-w-2xl mx-auto mb-10">
                <div className="bg-[#0a0a0f] rounded-xl border border-white/10 p-5 font-mono text-sm">
                  <div className="text-white/40 mb-1">&lt;!-- Add to your site --&gt;</div>
                  <div>
                    <span className="text-pink-400">&lt;script</span>{" "}
                    <span className="text-sky-400">src</span>
                    <span className="text-white">=</span>
                    <span className="text-emerald-400">&quot;https://your-app.aexy.io/aexy-track.js&quot;</span>
                  </div>
                  <div className="pl-8">
                    <span className="text-sky-400">data-workspace</span>
                    <span className="text-white">=</span>
                    <span className="text-emerald-400">&quot;YOUR_KEY&quot;</span>
                    <span className="text-pink-400">&gt;&lt;/script&gt;</span>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                {trackingCapabilities.map((item, idx) => (
                  <div key={idx} className="text-center p-6 bg-white/5 rounded-2xl border border-white/10">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <item.icon className="h-6 w-6 text-indigo-400" />
                    </div>
                    <h3 className="text-white font-medium mb-1">{item.label}</h3>
                    <p className="text-white/40 text-xs">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              From anonymous visitor to qualified lead
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Automated pipeline that runs 24/7. No manual enrichment, no spreadsheets.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                icon: Globe,
                title: "Capture",
                description: "Tracking pixel captures page views, scroll depth, UTMs, and session behavior. Cookie-based anonymous IDs link visits over time.",
                color: "from-indigo-500 to-blue-500",
              },
              {
                step: "02",
                icon: Building2,
                title: "Identify",
                description: "Snitcher resolves IPs to company data. Identity resolution links anonymous sessions to CRM contacts via form fills and email clicks.",
                color: "from-violet-500 to-purple-500",
              },
              {
                step: "03",
                icon: TrendingUp,
                title: "Score & Route",
                description: "Multi-factor scoring (firmographic + behavioral + engagement) assigns 0-100 scores. Lifecycle stage engine auto-promotes MQLs to sales.",
                color: "from-fuchsia-500 to-pink-500",
              },
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 h-full hover:border-white/20 transition-all">
                  <div className="text-5xl font-bold text-white/5 mb-4">{step.step}</div>
                  <div className={`p-3 bg-gradient-to-br ${step.color} rounded-xl w-fit mb-4`}>
                    <step.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-3">{step.title}</h3>
                  <p className="text-white/50 text-sm">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations / What connects */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="h-5 w-5 text-indigo-400" />
                <span className="text-white font-medium">Pipeline at a Glance</span>
              </div>
              <div className="space-y-4">
                {[
                  { label: "Visitors Today", value: "1,248", icon: Eye, trend: "+12%" },
                  { label: "Companies Identified", value: "312", icon: Building2, trend: "+8%" },
                  { label: "New Leads (MQL)", value: "34", icon: Users, trend: "+23%" },
                  { label: "Active Sequences", value: "7", icon: Mail, trend: "" },
                ].map((metric, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 bg-white/5 rounded-lg">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-lg flex items-center justify-center">
                      <metric.icon className="h-5 w-5 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white/50 text-xs">{metric.label}</p>
                      <p className="text-white text-lg font-bold">{metric.value}</p>
                    </div>
                    {metric.trend && (
                      <span className="text-emerald-400 text-sm font-medium">{metric.trend}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 rounded-full text-indigo-400 text-xs mb-4">
                <BarChart3 className="h-3 w-3" />
                REAL-TIME DASHBOARD
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Every signal, one dashboard
              </h2>
              <p className="text-white/60 mb-6">
                KPI cards, visitor funnel, provider health, recent sessions — all
                updating in real time. Drill into any visitor session to see the
                full event timeline and company card.
              </p>
              <ul className="space-y-3">
                {[
                  "4 KPI stat cards with period-over-period comparison",
                  "Visual funnel: Visitor to Customer conversion",
                  "Session detail with full event timeline",
                  "One-click identify or link to CRM contact",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-white/70">
                    <CheckCircle2 className="h-5 w-5 text-indigo-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Stop guessing. Start knowing.
          </h2>
          <p className="text-xl text-white/50 mb-10">
            See who visits your site, score them automatically, and route hot leads to sales — all for $55/mo.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
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

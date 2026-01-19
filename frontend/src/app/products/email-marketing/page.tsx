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
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Palette,
    title: "Visual Email Builder",
    description: "Drag-and-drop email creation with 16+ block types. Hero sections, buttons, social links, and dynamic content.",
    color: "from-sky-500 to-blue-500",
  },
  {
    icon: BarChart3,
    title: "Full Analytics",
    description: "Track opens, clicks, bounces, and conversions. Device breakdown, ISP metrics, and AI-powered send time optimization.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Globe,
    title: "Multi-Domain Sending",
    description: "Route emails through multiple domains and providers. Automatic failover and smart ISP-based routing.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: Zap,
    title: "IP Warming Automation",
    description: "AI-driven warming schedules. Conservative, moderate, or aggressive plans with automatic health monitoring.",
    color: "from-amber-500 to-orange-500",
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
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-500/20 to-blue-500/20 border border-sky-500/30 rounded-full text-sky-400 text-sm mb-6">
                <Mail className="h-4 w-4" />
                <span>Email Marketing</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Campaigns{" "}
                <span className="bg-gradient-to-r from-sky-400 to-blue-400 bg-clip-text text-transparent">
                  that convert
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                Email marketing built for modern teams. Visual builder, full tracking,
                multi-domain infrastructure, and AI-powered warming.
                Enterprise-grade deliverability without the complexity.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-sky-500 to-blue-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(14,165,233,0.3)]"
                >
                  Start Sending Free
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
                  <CheckCircle2 className="h-4 w-4 text-sky-500" />
                  Visual drag-and-drop
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sky-500" />
                  Multi-provider routing
                </span>
              </div>
            </div>

            {/* Visual - Campaign Dashboard Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-sky-500/20 to-blue-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white font-medium">Recent Campaigns</h3>
                  <button className="px-3 py-1 bg-sky-500/20 text-sky-400 text-xs rounded-full flex items-center gap-1">
                    <Send className="h-3 w-3" />
                    New Campaign
                  </button>
                </div>

                {/* Campaign List */}
                <div className="space-y-3 mb-6">
                  {campaignTypes.map((campaign, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer">
                      <div className="w-10 h-10 bg-gradient-to-br from-sky-500/30 to-blue-500/30 rounded-full flex items-center justify-center">
                        <Mail className="h-5 w-5 text-sky-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{campaign.name}</p>
                        <p className="text-white/40 text-xs">{campaign.sent} sent</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-emerald-400">{campaign.opens} opens</span>
                        <span className="text-sky-400">{campaign.clicks} clicks</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Stats Bar */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total Sent", value: "25.8K", color: "sky" },
                    { label: "Avg Open Rate", value: "48.3%", color: "emerald" },
                    { label: "Avg Click Rate", value: "16.1%", color: "purple" },
                  ].map((stat, idx) => (
                    <div key={idx} className={`p-3 bg-${stat.color}-500/10 rounded-xl text-center`}>
                      <p className={`text-${stat.color}-400 text-lg font-bold`}>{stat.value}</p>
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
              Everything you need to send at scale
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              From visual design to deliverability infrastructure. Built for teams who care about results.
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

      {/* Visual Builder */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-500/20 rounded-full text-sky-400 text-xs mb-4">
                <Palette className="h-3 w-3" />
                VISUAL BUILDER
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Design emails without code
              </h2>
              <p className="text-white/60 mb-6">
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
                  <li key={idx} className="flex items-center gap-3 text-white/70">
                    <CheckCircle2 className="h-5 w-5 text-sky-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <Layers className="h-5 w-5 text-sky-400" />
                <span className="text-white font-medium">Block Library</span>
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
                  <div key={idx} className="p-3 bg-white/5 rounded-lg text-center hover:bg-white/10 transition-colors cursor-pointer">
                    <div className="text-sky-400 text-lg font-mono mb-1">{block.icon}</div>
                    <p className="text-white/50 text-xs">{block.name}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tracking & Analytics */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-sky-500/10 to-blue-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="text-center mb-10">
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  Full-funnel tracking & analytics
                </h2>
                <p className="text-white/60">
                  Know exactly how your emails perform. From sends to conversions.
                </p>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                {trackingFeatures.map((item, idx) => (
                  <div key={idx} className="text-center p-6 bg-white/5 rounded-2xl border border-white/10">
                    <div className="w-12 h-12 bg-gradient-to-br from-sky-500/20 to-blue-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <item.icon className="h-6 w-6 text-sky-400" />
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

      {/* Infrastructure */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <Globe className="h-5 w-5 text-purple-400" />
                <span className="text-white font-medium">Sending Infrastructure</span>
              </div>
              <div className="space-y-3">
                {[
                  { domain: "mail.example.com", status: "Active", health: "98%", color: "emerald" },
                  { domain: "send.company.io", status: "Warming", health: "Day 7/14", color: "amber" },
                  { domain: "notify.app.dev", status: "Active", health: "95%", color: "emerald" },
                ].map((domain, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 bg-white/5 rounded-lg">
                    <div className={`w-2 h-2 rounded-full bg-${domain.color}-400`} />
                    <div className="flex-1">
                      <p className="text-white text-sm">{domain.domain}</p>
                      <p className="text-white/40 text-xs">{domain.status}</p>
                    </div>
                    <span className={`text-${domain.color}-400 text-sm`}>{domain.health}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/20 rounded-full text-purple-400 text-xs mb-4">
                <Settings className="h-3 w-3" />
                INFRASTRUCTURE
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Enterprise-grade deliverability
              </h2>
              <p className="text-white/60 mb-6">
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
                  <li key={idx} className="flex items-center gap-3 text-white/70">
                    <CheckCircle2 className="h-5 w-5 text-purple-400" />
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
            Ready to send emails that get results?
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Start with the visual builder. Scale with enterprise infrastructure.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-sky-500 to-blue-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
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

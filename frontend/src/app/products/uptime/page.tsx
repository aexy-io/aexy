"use client";

import Link from "next/link";
import {
  ArrowRight,
  MonitorCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe,
  Zap,
  Bell,
  Ticket,
  Activity,
  Shield,
  Github,
  Wifi,
  Server,
  Lock,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Globe,
    title: "Multi-Protocol Monitoring",
    description: "Monitor HTTP endpoints, TCP ports, and WebSocket connections. Verify SSL certificates and track response times.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Ticket,
    title: "Auto-Ticketing",
    description: "Automatically create support tickets when incidents occur. Auto-close tickets when services recover.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Bell,
    title: "Smart Alerts",
    description: "Get notified via Slack, email, or webhooks. Configure thresholds to avoid false positives.",
    color: "from-amber-500 to-orange-500",
  },
  {
    icon: Activity,
    title: "Uptime Reports",
    description: "Track uptime percentages, response times, and incident history. Export reports for SLA compliance.",
    color: "from-purple-500 to-violet-500",
  },
];

const checkTypes = [
  { name: "HTTP", color: "bg-emerald-500", icon: Globe },
  { name: "TCP", color: "bg-blue-500", icon: Server },
  { name: "WebSocket", color: "bg-purple-500", icon: Wifi },
  { name: "SSL", color: "bg-amber-500", icon: Lock },
];

export default function UptimeProductPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm mb-6">
                <MonitorCheck className="h-4 w-4" />
                <span>Uptime Monitoring</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Know when your{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  services go down
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                Monitor endpoints, get instant alerts, and automatically create tickets.
                Keep your services healthy with real-time monitoring built for engineering teams.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(16,185,129,0.3)]"
                >
                  Start Monitoring Free
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
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  1-minute checks
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Auto-ticketing
                </span>
              </div>
            </div>

            {/* Visual - Monitor Dashboard Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2">
                      {checkTypes.map((type, idx) => (
                        <span key={idx} className={`px-2 py-1 ${type.color}/20 rounded text-xs flex items-center gap-1`}>
                          <type.icon className={`h-3 w-3 ${type.color.replace('bg-', 'text-')}`} />
                          <span className="text-white/60">{type.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    Live
                  </div>
                </div>
                {/* Monitor List */}
                <div className="divide-y divide-white/5">
                  {[
                    { name: "API Production", type: "HTTP", status: "up", uptime: "99.98%", responseTime: "142ms" },
                    { name: "Database Primary", type: "TCP", status: "up", uptime: "100%", responseTime: "12ms" },
                    { name: "WebSocket Gateway", type: "WebSocket", status: "up", uptime: "99.95%", responseTime: "89ms" },
                    { name: "Auth Service", type: "HTTP", status: "down", uptime: "98.5%", responseTime: "-" },
                  ].map((monitor, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors cursor-pointer">
                      <div className={`w-3 h-3 rounded-full ${monitor.status === "up" ? "bg-emerald-500" : "bg-red-500"} ${monitor.status === "down" ? "animate-pulse" : ""}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-white text-sm font-medium">{monitor.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            monitor.type === "HTTP" ? "bg-emerald-500/20 text-emerald-400" :
                            monitor.type === "TCP" ? "bg-blue-500/20 text-blue-400" :
                            "bg-purple-500/20 text-purple-400"
                          }`}>
                            {monitor.type}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-medium ${monitor.status === "up" ? "text-emerald-400" : "text-red-400"}`}>
                          {monitor.uptime}
                        </span>
                        <p className="text-xs text-white/40">{monitor.responseTime}</p>
                      </div>
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
              Everything you need for reliable monitoring
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              From simple HTTP checks to complex incident management with automatic ticketing.
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

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    Automatic incident management
                  </h2>
                  <p className="text-white/60 mb-6">
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
                        <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 text-sm font-bold flex-shrink-0">
                          {item.step}
                        </div>
                        <div>
                          <h4 className="text-white font-medium">{item.title}</h4>
                          <p className="text-white/50 text-sm">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-center">
                  <div className="inline-flex flex-col items-center gap-3 p-6 bg-white/5 rounded-xl border border-white/10">
                    <AlertTriangle className="h-12 w-12 text-amber-500" />
                    <div className="text-white font-medium">Incident Detected</div>
                    <div className="flex items-center gap-2 text-sm text-white/50">
                      <Clock className="h-4 w-4" />
                      Auto-ticket in 3 failures
                    </div>
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
            Start monitoring your services today
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Free for up to 10 monitors. No credit card required.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
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

"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Mail,
  Sparkles,
  Shield,
  Clock,
  Cpu,
  Wrench,
  Building2,
} from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Mail,
    title: "Email Automation",
    description: "Auto-respond to emails with context-aware replies. Handle inquiries, follow-ups, and escalations automatically.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: Building2,
    title: "CRM Integration",
    description: "Search contacts, enrich data, update records, and log activities automatically as agents interact.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Cpu,
    title: "Multiple LLM Providers",
    description: "Choose between Claude (Anthropic), Gemini (Google), or Ollama for self-hosted inference.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Shield,
    title: "Confidence Thresholds",
    description: "Set approval requirements below confidence thresholds. Never send uncertain responses without review.",
    color: "from-amber-500 to-orange-500",
  },
];

const agentTypes = [
  { type: "Support", desc: "Customer support automation", color: "bg-blue-500" },
  { type: "Sales", desc: "Outreach and follow-ups", color: "bg-green-500" },
  { type: "Scheduling", desc: "Calendar management", color: "bg-purple-500" },
  { type: "Custom", desc: "Build your own", color: "bg-amber-500" },
];

const tools = [
  { name: "reply", category: "Actions" },
  { name: "escalate", category: "Actions" },
  { name: "create_task", category: "Actions" },
  { name: "search_contacts", category: "CRM" },
  { name: "enrich_person", category: "Enrichment" },
  { name: "send_email", category: "Email" },
  { name: "send_slack", category: "Communication" },
  { name: "web_search", category: "Research" },
];

export default function AIAgentsProductPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-violet-500/20 border border-purple-500/30 rounded-full text-purple-400 text-sm mb-6">
                <Bot className="h-4 w-4" />
                <span>AI Agents</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 tracking-tight leading-tight">
                Intelligent{" "}
                <span className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">
                  automation
                </span>{" "}
                across your stack
              </h1>

              <p className="text-xl text-foreground/60 mb-8 leading-relaxed">
                Create custom AI agents to handle email, support, scheduling, and CRM tasks.
                Configure LLM providers, tools, and behavior. Works across your entire workflow.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-purple-500 to-violet-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(139,92,246,0.3)]"
                >
                  Create Your First Agent
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </a>
                <Link
                  href="/manifesto"
                  className="group inline-flex items-center justify-center gap-2 bg-white/5 text-foreground px-8 py-4 rounded-full text-lg font-medium border border-white/10 hover:border-white/20 transition-all"
                >
                  Learn More
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-foreground/40">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-500" />
                  Multi-LLM support
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-500" />
                  Customizable tools
                </span>
              </div>
            </div>

            {/* Visual - Agent Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                      <Bot className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-foreground font-medium">Support Agent</h3>
                      <span className="text-xs text-muted-foreground">@support</span>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">Active</span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="text-center p-3 bg-white/5 rounded-xl">
                    <div className="text-xl font-bold text-foreground">847</div>
                    <div className="text-xs text-muted-foreground">Runs</div>
                  </div>
                  <div className="text-center p-3 bg-white/5 rounded-xl">
                    <div className="text-xl font-bold text-green-400">94%</div>
                    <div className="text-xs text-muted-foreground">Success</div>
                  </div>
                  <div className="text-center p-3 bg-white/5 rounded-xl">
                    <div className="text-xl font-bold text-foreground">1.2s</div>
                    <div className="text-xs text-muted-foreground">Avg Time</div>
                  </div>
                </div>

                {/* Tools */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {["reply", "escalate", "search_contacts", "create_task"].map((tool) => (
                    <span key={tool} className="px-2 py-1 bg-purple-500/10 text-purple-400 text-xs rounded-full">
                      {tool}
                    </span>
                  ))}
                </div>

                {/* Activity */}
                <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-purple-400" />
                  <span className="text-foreground/70 text-sm">Processed 12 emails in the last hour</span>
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
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Build agents that work for you
            </h2>
            <p className="text-foreground/50 text-lg max-w-2xl mx-auto">
              Configure intelligent automation with fine-grained control over behavior, tools, and confidence thresholds.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, idx) => (
              <div key={idx} className="group relative">
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} rounded-3xl opacity-0 group-hover:opacity-10 blur-xl transition-all duration-500`} />
                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all h-full">
                  <div className={`p-4 bg-gradient-to-br ${feature.color} rounded-2xl w-fit mb-6`}>
                    <feature.icon className="h-6 w-6 text-foreground" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">{feature.title}</h3>
                  <p className="text-foreground/60">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent Types */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-violet-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="text-center mb-10">
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                  Pre-built agent types
                </h2>
                <p className="text-foreground/60">
                  Start with a template or build fully custom agents from scratch.
                </p>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                {agentTypes.map((agent, idx) => (
                  <div key={idx} className="text-center p-6 bg-white/5 rounded-2xl border border-white/10 hover:border-purple-500/30 transition-all">
                    <div className={`w-12 h-12 ${agent.color} rounded-xl flex items-center justify-center mx-auto mb-3`}>
                      <Bot className="h-6 w-6 text-foreground" />
                    </div>
                    <h3 className="text-foreground font-medium mb-1">{agent.type}</h3>
                    <p className="text-foreground/40 text-xs">{agent.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/20 rounded-full text-purple-400 text-xs mb-4">
                <Wrench className="h-3 w-3" />
                EXTENSIBLE TOOLS
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                Grant access to powerful tools
              </h2>
              <p className="text-foreground/60 mb-6">
                Each agent can access a curated set of tools. Control what actions agents can take
                with granular permissions.
              </p>
              <ul className="space-y-3">
                {[
                  "CRM tools: search, create, update records",
                  "Email tools: send, draft, get history",
                  "Actions: reply, escalate, create tasks",
                  "Enrichment: company & person data",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-foreground/70">
                    <CheckCircle2 className="h-5 w-5 text-purple-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <Wrench className="h-5 w-5 text-purple-400" />
                <span className="text-foreground font-medium">Available Tools</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tools.map((tool, idx) => (
                  <div key={idx} className="p-3 bg-white/5 rounded-lg">
                    <div className="text-foreground text-sm font-medium">{tool.name}</div>
                    <div className="text-foreground/40 text-xs">{tool.category}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Working Hours & Behavior */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 order-2 md:order-1">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="h-5 w-5 text-purple-400" />
                <span className="text-foreground font-medium">Behavior Settings</span>
              </div>
              <div className="space-y-4">
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-foreground/60 text-sm">Confidence Threshold</span>
                    <span className="text-foreground font-medium">70%</span>
                  </div>
                  <div className="h-2 bg-accent rounded-full">
                    <div className="h-2 bg-purple-500 rounded-full" style={{ width: "70%" }} />
                  </div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg flex items-center justify-between">
                  <span className="text-foreground/60 text-sm">Working Hours</span>
                  <span className="text-foreground">9:00 - 17:00 EST</span>
                </div>
                <div className="p-3 bg-white/5 rounded-lg flex items-center justify-between">
                  <span className="text-foreground/60 text-sm">Max Daily Responses</span>
                  <span className="text-foreground">100</span>
                </div>
                <div className="p-3 bg-white/5 rounded-lg flex items-center justify-between">
                  <span className="text-foreground/60 text-sm">Response Delay</span>
                  <span className="text-foreground">5 minutes</span>
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/20 rounded-full text-purple-400 text-xs mb-4">
                <Shield className="h-3 w-3" />
                SAFETY CONTROLS
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                Fine-grained behavior control
              </h2>
              <p className="text-foreground/60 mb-6">
                Set confidence thresholds, working hours, response limits, and escalation rules.
                Agents only act when you want them to.
              </p>
              <ul className="space-y-3">
                {[
                  "Require approval for low-confidence responses",
                  "Configure working hours per timezone",
                  "Set daily response limits",
                  "Add response delays for natural timing",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-foreground/70">
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
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Automate intelligently
          </h2>
          <p className="text-xl text-foreground/50 mb-10">
            Create AI agents that work across your entire workflow.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-purple-500 to-violet-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group bg-white/5 hover:bg-white/10 text-foreground px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              <SiGithub className="h-5 w-5" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

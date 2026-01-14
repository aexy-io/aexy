"use client";

import Link from "next/link";
import {
  ArrowRight,
  FormInput,
  CheckCircle2,
  Zap,
  Layout,
  Workflow,
  FileText,
  Bell,
  BarChart3,
  Eye,
  Share2,
  Lock,
  Palette,
  Sparkles,
  MousePointer2,
  Github,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Layout,
    title: "Drag & Drop Builder",
    description: "Build beautiful forms without code. Drag fields, customize layouts, and preview in real-time.",
    color: "from-violet-500 to-purple-500",
  },
  {
    icon: Workflow,
    title: "Conditional Logic",
    description: "Show or hide fields based on responses. Create dynamic forms that adapt to user input.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Share2,
    title: "Multiple Destinations",
    description: "Send responses to Slack, email, webhooks, or create tickets automatically.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: BarChart3,
    title: "Response Analytics",
    description: "Track completion rates, average time, and drop-off points. Optimize your forms with data.",
    color: "from-amber-500 to-orange-500",
  },
];

const fieldTypes = [
  "Text", "Email", "Number", "Date", "Select", "Multi-select",
  "File Upload", "Signature", "Rating", "NPS"
];

export default function FormsProductPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-violet-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/30 rounded-full text-violet-400 text-sm mb-6">
                <FormInput className="h-4 w-4" />
                <span>Form Builder</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Beautiful forms in{" "}
                <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  minutes
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                Drag-and-drop form builder with conditional logic, integrations,
                and analytics. Create intake forms, surveys, and bug reports without code.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(139,92,246,0.3)]"
                >
                  Create a Form Free
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
                  <CheckCircle2 className="h-4 w-4 text-violet-500" />
                  No code required
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-violet-500" />
                  Unlimited responses
                </span>
              </div>
            </div>

            {/* Visual - Form Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/20 to-purple-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white font-medium">Bug Report Form</h3>
                  <div className="flex gap-2">
                    <button className="p-2 bg-white/5 rounded-lg">
                      <Eye className="h-4 w-4 text-white/40" />
                    </button>
                    <button className="p-2 bg-violet-500/20 rounded-lg">
                      <Share2 className="h-4 w-4 text-violet-400" />
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                    <label className="text-white/60 text-sm mb-2 block">Bug Title *</label>
                    <div className="h-10 bg-white/5 rounded-lg border border-white/10" />
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                    <label className="text-white/60 text-sm mb-2 block">Severity</label>
                    <div className="flex gap-2">
                      {["Low", "Medium", "High", "Critical"].map((s, i) => (
                        <span key={i} className={`px-3 py-1.5 rounded-lg text-sm ${i === 2 ? "bg-violet-500 text-white" : "bg-white/5 text-white/40 border border-white/10"}`}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                    <label className="text-white/60 text-sm mb-2 block">Description</label>
                    <div className="h-24 bg-white/5 rounded-lg border border-white/10" />
                  </div>
                  <button className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-500 rounded-xl text-white font-medium">
                    Submit Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Field Types */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-8">20+ field types</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {fieldTypes.map((field, idx) => (
              <span key={idx} className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white/60 text-sm hover:bg-white/10 hover:text-white transition-all cursor-default">
                {field}
              </span>
            ))}
            <span className="px-4 py-2 bg-violet-500/20 border border-violet-500/30 rounded-full text-violet-400 text-sm">
              +10 more
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Forms that work for you
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Build once, use everywhere. Collect data and trigger automations.
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

      {/* Use Cases */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Built for engineering teams
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: "Bug Reports", desc: "Let users submit bugs directly to your ticketing system", icon: FileText },
              { title: "Feature Requests", desc: "Collect and prioritize user feedback automatically", icon: Sparkles },
              { title: "Intake Forms", desc: "Onboard new projects with structured intake forms", icon: MousePointer2 },
            ].map((uc, idx) => (
              <div key={idx} className="p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-violet-500/20 to-purple-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <uc.icon className="h-6 w-6 text-violet-400" />
                </div>
                <h3 className="text-white font-semibold mb-2">{uc.title}</h3>
                <p className="text-white/50 text-sm">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Create your first form in minutes
          </h2>
          <p className="text-xl text-white/50 mb-10">
            No credit card required. Free for small teams.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
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

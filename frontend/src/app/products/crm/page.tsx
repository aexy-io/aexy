"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Mail,
  Calendar,
  Users,
  Sparkles,
  Bot,
  Inbox,
  Phone,
  Globe,
  TrendingUp,
  Target,
  Link2,
  BarChart3,
  UserPlus,
  Github,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Mail,
    title: "Gmail Sync",
    description: "Two-way email sync with Gmail. All conversations automatically linked to contacts and deals.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: Calendar,
    title: "Calendar Integration",
    description: "Google Calendar sync with automatic contact linking. Never miss a meeting or follow-up.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Bot,
    title: "AI Contact Enrichment",
    description: "Automatically extract and enrich contact info from email signatures, LinkedIn, and more.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: TrendingUp,
    title: "Sales Pipeline",
    description: "Visual deal tracking with customizable stages. Forecast revenue and track conversion rates.",
    color: "from-amber-500 to-orange-500",
  },
];

const contacts = [
  { name: "Sarah Chen", company: "TechCorp", role: "VP Engineering", email: 12, meetings: 3 },
  { name: "Mike Johnson", company: "StartupX", role: "CTO", email: 8, meetings: 2 },
  { name: "Alex Rivera", company: "DataCo", role: "Director", email: 5, meetings: 1 },
];

export default function CRMProductPage() {
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
                <Building2 className="h-4 w-4" />
                <span>CRM for Engineering</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Relationships{" "}
                <span className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">
                  connected
                </span>{" "}
                to delivery
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                CRM that integrates with your engineering workflow.
                Gmail sync, AI enrichment, and deep linking to projects and tickets.
                This isn&apos;t a sales-only CRM.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-purple-500 to-violet-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(139,92,246,0.3)]"
                >
                  Start CRM Free
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
                  <CheckCircle2 className="h-4 w-4 text-purple-500" />
                  Gmail & Calendar sync
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-500" />
                  AI enrichment
                </span>
              </div>
            </div>

            {/* Visual - CRM Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-violet-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white font-medium">Recent Contacts</h3>
                  <button className="px-3 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full flex items-center gap-1">
                    <UserPlus className="h-3 w-3" />
                    Add Contact
                  </button>
                </div>

                {/* Contact List */}
                <div className="space-y-3 mb-6">
                  {contacts.map((contact, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500/30 to-violet-500/30 rounded-full flex items-center justify-center text-white font-medium">
                        {contact.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{contact.name}</p>
                        <p className="text-white/40 text-xs">{contact.role} at {contact.company}</p>
                      </div>
                      <div className="flex items-center gap-3 text-white/40 text-xs">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {contact.email}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {contact.meetings}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI Enrichment */}
                <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-purple-400" />
                  <span className="text-white/70 text-sm">AI enriched 3 contacts from email signatures</span>
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
              CRM built for engineering teams
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Not a traditional sales CRM. A relationship management system that connects people to projects.
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

      {/* Connected to Everything */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-violet-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="text-center mb-10">
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  Connected to your engineering workflow
                </h2>
                <p className="text-white/60">
                  Link contacts to projects, tickets, and team members. See the full picture.
                </p>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                {[
                  { icon: Mail, label: "Emails", desc: "Auto-synced from Gmail" },
                  { icon: Calendar, label: "Meetings", desc: "Calendar integration" },
                  { icon: Target, label: "Projects", desc: "Link to epics & tickets" },
                  { icon: Users, label: "Team", desc: "Associate with members" },
                ].map((item, idx) => (
                  <div key={idx} className="text-center p-6 bg-white/5 rounded-2xl border border-white/10">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500/20 to-violet-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <item.icon className="h-6 w-6 text-purple-400" />
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

      {/* Inbox Feature */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/20 rounded-full text-purple-400 text-xs mb-4">
                <Inbox className="h-3 w-3" />
                CRM INBOX
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Email that works with you
              </h2>
              <p className="text-white/60 mb-6">
                Reply to emails directly from Aexy. All conversations automatically linked to contacts
                and deals. Never lose context again.
              </p>
              <ul className="space-y-3">
                {[
                  "Two-way Gmail sync",
                  "Reply directly from CRM",
                  "Auto-link to contacts & deals",
                  "Email templates & sequences",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-white/70">
                    <CheckCircle2 className="h-5 w-5 text-purple-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <Inbox className="h-5 w-5 text-purple-400" />
                <span className="text-white font-medium">Inbox</span>
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">3 new</span>
              </div>
              <div className="space-y-3">
                {[
                  { from: "Sarah Chen", subject: "Re: Q1 Roadmap Discussion", time: "2m" },
                  { from: "Mike Johnson", subject: "Partnership Opportunity", time: "15m" },
                  { from: "Alex Rivera", subject: "Technical Review Feedback", time: "1h" },
                ].map((email, idx) => (
                  <div key={idx} className="p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white text-sm font-medium">{email.from}</span>
                      <span className="text-white/40 text-xs">{email.time}</span>
                    </div>
                    <p className="text-white/50 text-sm truncate">{email.subject}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Manage relationships the right way
          </h2>
          <p className="text-xl text-white/50 mb-10">
            CRM that connects to your engineering workflow.
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

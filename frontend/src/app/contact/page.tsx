"use client";

import { Mail, MessageSquare, Shield, Briefcase, ArrowRight } from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const CONTACTS = [
  {
    icon: Briefcase,
    title: "Sales & enterprise",
    desc: "Talk to us about teams of 10+, custom deployment, or enterprise terms.",
    email: "sales@aexy.io",
    color: "from-primary-500 to-primary-600",
  },
  {
    icon: MessageSquare,
    title: "Support & feedback",
    desc: "Questions about the product, bugs, feature requests.",
    email: "hello@aexy.io",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: Shield,
    title: "Security",
    desc: "Responsible disclosure for vulnerabilities and security questions.",
    email: "security@aexy.io",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Briefcase,
    title: "Careers",
    desc: "Open applications, partnerships, contributor questions.",
    email: "careers@aexy.io",
    color: "from-amber-500 to-orange-500",
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      <section className="pt-32 pb-16 px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500/20 to-purple-500/20 border border-primary-500/30 rounded-full text-primary-400 text-sm mb-6">
            <Mail className="h-4 w-4" />
            Contact
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            Get in{" "}
            <span className="bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
              touch
            </span>
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            We try to reply within one business day. The fastest path is email.
          </p>
        </div>
      </section>

      <section className="py-16 px-6 relative">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            {CONTACTS.map(({ icon: Icon, title, desc, email, color }) => (
              <a
                key={email}
                href={`mailto:${email}`}
                className="group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all"
              >
                <div className={`p-3 bg-gradient-to-br ${color} rounded-2xl shadow-lg w-fit mb-4`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-white/50 text-sm mb-4 leading-relaxed">{desc}</p>
                <div className="inline-flex items-center gap-2 text-primary-400 text-sm font-medium group-hover:gap-3 transition-all">
                  {email}
                  <ArrowRight className="h-4 w-4" />
                </div>
              </a>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-white/40 text-sm mb-4">Prefer to file an issue?</p>
            <a
              href="https://github.com/aexy-io/aexy/issues"
              className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm transition"
            >
              <SiGithub className="h-4 w-4" />
              Open an issue on GitHub
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

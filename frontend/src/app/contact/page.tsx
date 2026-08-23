"use client";

import { Mail, MessageSquare, Shield, Briefcase, ArrowRight } from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { LedgerPage } from "@/components/landing/LedgerPage";

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
    <LedgerPage className="overflow-hidden">

      <section className="pt-32 pb-16 px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            <Mail className="h-4 w-4" />
            Contact
          </div>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold mb-6 tracking-tight leading-tight">
            Get in{" "}
            <span className="text-ledger-green">
              touch
            </span>
          </h1>
          <p className="text-xl text-ledger-ink/65 max-w-2xl mx-auto">
            We try to reply within one business day. The fastest path is email.
          </p>
        </div>
      </section>

      <section className="py-16 px-6 relative">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            {CONTACTS.map(({ icon: Icon, title, desc, email }) => (
              <a
                key={email}
                href={`mailto:${email}`}
                className="group relative bg-ledger-card border border-ledger-ink/12 rounded-[2px] p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <Icon className="mb-4 h-5 w-5 text-ledger-green" />
                <h3 className="font-display text-xl font-semibold mb-2">{title}</h3>
                <p className="text-ledger-ink/55 text-sm mb-4 leading-relaxed">{desc}</p>
                <div className="inline-flex items-center gap-2 text-ledger-green text-sm font-medium group-hover:gap-3 transition-all">
                  {email}
                  <ArrowRight className="h-4 w-4" />
                </div>
              </a>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-ledger-ink/50 text-sm mb-4">Prefer to file an issue?</p>
            <a
              href="https://github.com/aexy-io/aexy/issues"
              className="inline-flex items-center gap-2 text-ledger-ink/70 hover:text-ledger-green text-sm transition"
            >
              <SiGithub className="h-4 w-4" />
              Open an issue on GitHub
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

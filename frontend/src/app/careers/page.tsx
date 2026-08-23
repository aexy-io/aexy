"use client";

import { ArrowRight, Briefcase, Globe, Code2, Heart } from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { LedgerPage } from "@/components/landing/LedgerPage";

// "Open Ledger" treatment: paper page, principles as hairline cards with bare
// green icons, and the no-roles state as a plain card rather than a glow panel.

const PRINCIPLES = [
  {
    icon: Globe,
    title: "Remote-first",
    desc: "Work from anywhere. We optimize for written communication and async work.",
  },
  {
    icon: Code2,
    title: "Build in the open",
    desc: "Most of our code, roadmap, and decisions are public. You ship to a real audience.",
  },
  {
    icon: Heart,
    title: "Sustainable pace",
    desc: "We don't celebrate burnout. We hire people we trust and let them work like adults.",
  },
];

export default function CareersPage() {
  return (
    <LedgerPage>

      <section className="relative px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            <Briefcase className="h-4 w-4" />
            Careers
          </div>
          <h1 className="mb-6 font-display text-4xl font-semibold leading-[1.04] tracking-tight md:text-5xl lg:text-6xl">
            Help us build the{" "}
            <span className="text-ledger-green">
              AI company OS
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-xl leading-8 text-ledger-ink/65">
            We&apos;re a small team building the workspace companies will use to run engineering,
            GTM, people, knowledge, workflows, and AI agents.
          </p>
        </div>
      </section>

      <section className="relative border-t border-ledger-ink/12 px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 md:grid-cols-3">
            {PRINCIPLES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
                <Icon className="mb-4 h-5 w-5 text-ledger-green" />
                <h3 className="mb-2 font-display text-xl font-semibold tracking-tight">{title}</h3>
                <p className="text-sm leading-6 text-ledger-ink/60">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-12 text-center">
            <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
              No open roles right now
            </h2>
            <p className="mx-auto mb-8 max-w-xl leading-7 text-ledger-ink/65">
              We don&apos;t have public roles posted at the moment, but we&apos;re always
              interested in talking to exceptional engineers, designers, and operators
              who care about open source.
            </p>

            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="mailto:careers@aexy.io?subject=Open%20Application"
                className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-6 py-3 text-sm font-semibold text-ledger-paper transition hover:bg-[#095A31]"
              >
                Send us your story
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="https://github.com/aexy-io/aexy"
                className="group flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-6 py-3 text-sm font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
              >
                <SiGithub className="h-4 w-4" />
                Contribute on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, Heart, Code2, Globe, Sparkles } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { defaultAuthor, organizationJsonLd, personJsonLd } from "@/components/marketing/AuthorByline";

// "Open Ledger" brand: paper page, ink text, ledger-green as the only accent.
// Tokens live in tailwind.config.ts; LedgerPage attaches the theme scope.
const VALUES = [
  {
    icon: Heart,
    title: "Transparency",
    desc: "Open-source code, public roadmap, honest communication.",
  },
  {
    icon: Code2,
    title: "Build for builders",
    desc: "We make tools we want to use ourselves. Engineers first.",
  },
  {
    icon: Globe,
    title: "Accessible to all",
    desc: "World-class engineering software, free for anyone to self-host.",
  },
  {
    icon: Sparkles,
    title: "Optimism in practice",
    desc: "We believe better software makes better organizations.",
  },
];

const aboutJsonLd = {
  "@context": "https://schema.org",
  "@graph": [organizationJsonLd(), personJsonLd()],
};

export default function AboutPage() {
  return (
    <LedgerPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }} />


      <section className="relative px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-5 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            About Aexy
          </p>
          <h1 className="mb-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ledger-ink md:text-5xl lg:text-6xl">
            We&apos;re building the{" "}
            <span className="text-ledger-green">
              AI company operating system
            </span>{" "}
            for modern teams.
          </h1>
          <p className="mx-auto max-w-2xl text-xl leading-8 text-ledger-ink/65">
            One platform that connects engineering, GTM, people, docs, workflows, and AI agents —
            transparent by default, free to self-host.
          </p>
        </div>
      </section>

      <section className="relative px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-16 space-y-6">
            <p className="text-xl leading-relaxed text-ledger-ink/75">
              Engineering teams are buried under disconnected tools — Jira here, Lattice there,
              HubSpot for revenue, Notion for docs, a separate vendor for everything else.
              Each one charges per seat. Each one owns your data.
            </p>
            <p className="text-xl leading-relaxed text-ledger-ink/75">
              Aexy is the alternative: one open-source platform where the work, the team, and
              the customer all live together. Self-host it free, forever. Or use the cloud
              and pay only for what you actually need.
            </p>
          </div>
        </div>
      </section>

      <section className="relative border-t border-ledger-ink/12 px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">
              What we believe
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <Icon className="mb-4 h-5 w-5 text-ledger-green" />
                <h3 className="mb-2 font-display text-xl font-semibold text-ledger-ink">{title}</h3>
                <p className="text-sm leading-6 text-ledger-ink/65">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id={defaultAuthor.slug} className="relative scroll-mt-24 border-t border-ledger-ink/12 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">
              Who&apos;s building this
            </h2>
          </div>
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 md:p-10">
            <div className="flex flex-col items-start gap-6 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={defaultAuthor.avatarUrl}
                alt={defaultAuthor.name}
                className="h-20 w-20 rounded-[2px] border border-ledger-ink/12"
                loading="lazy"
              />
              <div>
                <h3 className="font-display text-xl font-semibold text-ledger-ink">{defaultAuthor.name}</h3>
                <p className="mb-3 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/55">
                  {defaultAuthor.role}
                </p>
                <p className="leading-relaxed text-ledger-ink/65">{defaultAuthor.bio}</p>
                <div className="mt-4 flex items-center gap-4 text-sm">
                  <a href={defaultAuthor.githubUrl} className="flex items-center gap-2 font-semibold text-ledger-green transition hover:text-ledger-ink">
                    <SiGithub className="h-4 w-4" />
                    GitHub
                  </a>
                  {defaultAuthor.websiteUrl && (
                    <a href={defaultAuthor.websiteUrl} className="font-semibold text-ledger-green transition hover:text-ledger-ink">
                      bhanu.io
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-ledger-ink/12 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-6 font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">
            Read more
          </h2>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/story"
              className="group flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
            >
              Our Story
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/mission"
              className="flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
            >
              Our Mission
            </Link>
            <Link
              href="/manifesto"
              className="flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
            >
              Company OS Manifesto
            </Link>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

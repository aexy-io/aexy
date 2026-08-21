"use client";

import Link from "next/link";
import { ArrowRight, Rss } from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { LedgerPage } from "@/components/landing/LedgerPage";

// "Open Ledger" treatment: paper page, mono eyebrow, and the empty state as a
// hairline card rather than a glowing panel.

export default function BlogPage() {
  return (
    <LedgerPage>

      <section className="relative px-6 pb-16 pt-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            <Rss className="h-4 w-4" />
            Blog
          </div>
          <h1 className="mb-6 font-display text-4xl font-semibold leading-[1.04] tracking-tight md:text-5xl lg:text-6xl">
            Notes on building an{" "}
            <span className="text-ledger-green">
              open AI company OS
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-xl leading-8 text-ledger-ink/65">
            Company operations, AI agents, product thinking, engineering culture, and lessons from building in the open.
          </p>
        </div>
      </section>

      <section className="relative border-t border-ledger-ink/12 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-12 text-center">
            <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
              The blog is coming soon
            </h2>
            <p className="mx-auto mb-8 max-w-xl leading-7 text-ledger-ink/65">
              We&apos;re writing our first posts. In the meantime, our work happens
              in the open — every commit, every roadmap discussion, every release
              is on GitHub.
            </p>

            <div className="mb-6 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="https://github.com/aexy-io/aexy"
                className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-6 py-3 text-sm font-semibold text-ledger-paper transition hover:bg-[#095A31]"
              >
                <SiGithub className="h-4 w-4" />
                Follow development on GitHub
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <Link
                href="/changelog"
                className="group flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-6 py-3 text-sm font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
              >
                Read the changelog
              </Link>
            </div>

            <p className="font-brand-mono text-xs text-ledger-ink/60">
              Want to be notified when we publish?{" "}
              <Link href="/contact" className="text-ledger-green underline decoration-ledger-green/30 underline-offset-4 transition hover:decoration-ledger-green">
                Get in touch
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

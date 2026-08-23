import Link from "next/link";
import { ArrowRight, CheckCircle2, GitBranch } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { BreadcrumbJsonLd } from "@/components/marketing/StructuredData";
import { AuthorByline, defaultAuthor, organizationJsonLd, personJsonLd } from "@/components/marketing/AuthorByline";

export interface ComparisonPageProps {
  competitor: string;
  /** This page's own route, e.g. "/compare/jira" — used for BreadcrumbList. */
  path: string;
  eyebrow: string;
  title: string;
  description: string;
  aexyBestFor: string[];
  competitorBestFor: string[];
  rows: Array<[string, string, string]>;
  migration: string[];
  faqs?: Array<[string, string]>;
}

export function ComparisonPage({
  competitor,
  path,
  eyebrow,
  title,
  description,
  aexyBestFor,
  competitorBestFor,
  rows,
  migration,
  faqs,
}: ComparisonPageProps) {
  const pageFaqs =
    faqs ||
    ([
      [`Is Aexy a direct replacement for ${competitor}?`, `Aexy can replace some ${competitor} workflows for teams that want CRM, GTM, engineering, docs, workflows, and AI agents in one company OS. The right path depends on your current process and migration risk.`],
      [`When should teams choose ${competitor}?`, `${competitor} can be the better choice when your team is already standardized around its core workflow and does not need a broader open company operating layer.`],
      ["How should we evaluate Aexy?", "Start with one workflow that crosses tools, then compare governance, migration effort, data control, internal links, and the number of handoffs Aexy can remove."],
    ] as Array<[string, string]>);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: pageFaqs.map(([name, text]) => ({
          "@type": "Question",
          name,
          acceptedAnswer: { "@type": "Answer", text },
        })),
      },
      {
        "@type": "Article",
        headline: title,
        description,
        author: { "@id": `https://aexy.io/about#${defaultAuthor.slug}` },
        publisher: { "@id": "https://aexy.io/#organization" },
      },
      personJsonLd(),
      organizationJsonLd(),
    ],
  };

  return (
    <LedgerPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbJsonLd trail={[{ name: `Aexy vs ${competitor}`, path }]} />

      <div className="relative">
        <section className="px-4 pb-20 pt-32 sm:px-6">
          <div className="mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
              <GitBranch className="h-4 w-4" />
              {eyebrow}
            </div>
            <h1 className="font-display text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">{title}</h1>
            <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-ledger-ink/65">{description}</p>
            {/* Comparison pages are the highest commercial intent on the site
                — somebody typing "aexy vs X" is mid-evaluation. Sending them to
                /contact (a page of mailto: links) as the only primary action
                threw that intent away. Try-it-now first, demo second. */}
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/login" className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]">
                Start free
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/contact" className="inline-flex items-center justify-center rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
                Book a migration call
              </Link>
            </div>
            <p className="mt-5 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/45">
              Free forever, self-hosted · No credit card ·{" "}
              <Link href="/pricing" className="underline decoration-ledger-ink/25 underline-offset-4 transition hover:text-ledger-green">
                See pricing
              </Link>
            </p>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2">
            <BestFor title="Aexy is best for" items={aexyBestFor} />
            <BestFor title={`${competitor} is best for`} items={competitorBestFor} />
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[2px] border border-ledger-ink/12 bg-ledger-card">
            <div className="grid grid-cols-3 border-b border-ledger-ink/12 px-5 py-4 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-ink/55">
              <div>Decision area</div>
              <div className="text-ledger-green">Aexy</div>
              <div>{competitor}</div>
            </div>
            {rows.map(([area, aexy, other]) => (
              <div key={area} className="grid grid-cols-1 gap-3 border-b border-ledger-ink/12 px-5 py-5 last:border-b-0 md:grid-cols-3">
                <div className="font-semibold">{area}</div>
                <div className="text-sm leading-6 text-ledger-ink/65">{aexy}</div>
                <div className="text-sm leading-6 text-ledger-ink/55">{other}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 sm:p-10 lg:grid-cols-[0.75fr_1fr]">
            <div>
              <h2 className="font-display text-4xl font-semibold tracking-tight">Migration path</h2>
              <p className="mt-5 text-lg leading-8 text-ledger-ink/60">
                Aexy does not require a rip-and-replace rollout. Start with the workflow that hurts most, then move more company context into the operating layer.
              </p>
            </div>
            <div className="space-y-3">
              {migration.map((step, index) => (
                <div key={step} className="flex gap-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-ledger-green font-brand-mono text-sm font-semibold text-ledger-paper">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-ledger-ink/65">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-4xl font-semibold tracking-tight">FAQ</h2>
            <div className="mt-8 space-y-4">
              {pageFaqs.map(([question, answer]) => (
                <div key={question} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6">
                  <h3 className="font-display text-xl font-semibold">{question}</h3>
                  <p className="mt-3 text-sm leading-6 text-ledger-ink/60">{answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-4 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <p className="mb-3 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">Written by</p>
            <AuthorByline />
          </div>
        </section>

        <section className="px-4 py-20 text-center sm:px-6">
          <h2 className="font-display text-4xl font-semibold tracking-tight">Compare with your real stack.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ledger-ink/60">
            We will map your current tools, identify the first migration workflow, and show where Aexy replaces or connects the stack.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/login" className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]">
              Start free
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/contact" className="inline-flex items-center justify-center rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
              Book a comparison call
            </Link>
          </div>
        </section>
      </div>

    </LedgerPage>
  );
}

function BestFor({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3 text-sm leading-6 text-ledger-ink/65">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-ledger-green" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

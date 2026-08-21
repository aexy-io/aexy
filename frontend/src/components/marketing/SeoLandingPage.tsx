import Link from "next/link";
import { ArrowRight, CheckCircle2, GitBranch } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { AuthorByline, defaultAuthor, organizationJsonLd, personJsonLd } from "@/components/marketing/AuthorByline";
import { BreadcrumbJsonLd } from "@/components/marketing/StructuredData";

export interface SeoLandingPageProps {
  eyebrow: string;
  title: string;
  /** This page's own route, e.g. "/for/founders" — used for BreadcrumbList. */
  path: string;
  /**
   * Short label for the breadcrumb leaf. Defaults to `eyebrow`, which is
   * already a short noun phrase ("For founders"). The /use-cases/* pages all
   * share the eyebrow "Use case", so they pass a distinct name instead.
   */
  breadcrumbName?: string;
  description: string;
  primaryCta?: string;
  secondaryCta?: string;
  proofPoints: string[];
  painPoints?: Array<{ problem: string; solution: string }>;
  sections: Array<{
    title: string;
    body: string;
    items: string[];
  }>;
  comparison?: {
    heading: string;
    description: string;
    competitorLabel: string;
    rows: Array<[string, string, string]>;
    links: Array<[string, string]>;
  };
  showPricingCta?: boolean;
  faqs: Array<[string, string]>;
  relatedLinks: Array<[string, string]>;
  schema: Record<string, unknown>;
}

export function SeoLandingPage({
  eyebrow,
  title,
  path,
  breadcrumbName,
  description,
  primaryCta = "Start free",
  secondaryCta = "Book a demo",
  proofPoints,
  painPoints,
  sections,
  comparison,
  showPricingCta,
  faqs,
  relatedLinks,
  schema,
}: SeoLandingPageProps) {
  const faqSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: faqs.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      {faqs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      )}
      <BreadcrumbJsonLd trail={[{ name: breadcrumbName ?? eyebrow, path }]} />

      <div className="relative">
        <section className="px-4 pb-16 pt-32 sm:px-6">
          <div className="mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
              <GitBranch className="h-4 w-4" />
              {eyebrow}
            </div>
            <h1 className="font-display text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">{title}</h1>
            <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-ledger-ink/65">{description}</p>
            {/* CTA order is deliberate: self-serve first, sales second.
                These pages catch high-intent search traffic ("open source crm",
                "aexy vs jira"), and the product is open source and free to
                self-host — so the visitor who is ready to act wants a workspace
                or a git clone, not a calendar invite. The old default sent all
                of them to /contact, which is a page of mailto: links. Booking a
                demo stays available as the secondary path. */}
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/login" className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]">
                {primaryCta}
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/contact" className="inline-flex items-center justify-center rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
                {secondaryCta}
              </Link>
            </div>
            <p className="mt-5 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/45">
              Free forever, self-hosted · No credit card ·{" "}
              <a href="https://github.com/aexy-io/aexy" className="underline decoration-ledger-ink/25 underline-offset-4 transition hover:text-ledger-green">
                Read the source
              </a>
            </p>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {proofPoints.map((point) => (
              <div key={point} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5 text-sm leading-6 text-ledger-ink/65">
                <CheckCircle2 className="mb-4 h-5 w-5 text-ledger-green" />
                {point}
              </div>
            ))}
          </div>
        </section>

        {painPoints && painPoints.length > 0 && (
          <section className="px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-5xl">
              <h2 className="text-center font-display text-4xl font-semibold tracking-tight">Sound familiar?</h2>
              <div className="mt-10 space-y-4">
                {painPoints.map(({ problem, solution }) => (
                  <div key={problem} className="grid gap-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 md:grid-cols-2">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0 font-brand-mono text-sm leading-6 text-ledger-red">✕</span>
                      <p className="text-sm leading-6 text-ledger-ink/55">{problem}</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-ledger-green" />
                      <p className="text-sm leading-6 text-ledger-ink/85">{solution}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {sections.map((section) => (
              <div key={section.title} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6">
                <h2 className="font-display text-2xl font-semibold">{section.title}</h2>
                <p className="mt-4 text-sm leading-6 text-ledger-ink/60">{section.body}</p>
                <div className="mt-6 space-y-3">
                  {section.items.map((item) => (
                    <div key={item} className="flex gap-3 text-sm leading-6 text-ledger-ink/65">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-ledger-green" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {comparison && (
          <section className="px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-7xl">
              <div className="max-w-3xl">
                <h2 className="font-display text-4xl font-semibold tracking-tight">{comparison.heading}</h2>
                <p className="mt-5 text-lg leading-8 text-ledger-ink/60">{comparison.description}</p>
              </div>
              <div className="mt-10 overflow-x-auto rounded-[2px] border border-ledger-ink/12 bg-ledger-card">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ledger-ink/12">
                      <th className="px-5 py-4 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-ink/50"> </th>
                      <th className="px-5 py-4 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-green">Aexy</th>
                      <th className="px-5 py-4 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-ink/70">{comparison.competitorLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.rows.map(([dimension, aexy, them]) => (
                      <tr key={dimension} className="border-b border-ledger-ink/12 last:border-b-0">
                        <td className="px-5 py-4 font-medium text-ledger-ink/70">{dimension}</td>
                        <td className="px-5 py-4 leading-6 text-ledger-ink/85">{aexy}</td>
                        <td className="px-5 py-4 leading-6 text-ledger-ink/55">{them}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {comparison.links.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  {comparison.links.map(([label, href]) => (
                    <Link key={href} href={href} className="inline-flex items-center gap-1.5 font-semibold text-ledger-green transition hover:text-[#095A31]">
                      {label}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {showPricingCta && (
          <section className="px-4 py-16 sm:px-6">
            <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-display text-3xl font-semibold tracking-tight">Self-host free. Use cloud when you want speed.</h2>
                <p className="mt-3 max-w-2xl text-lg leading-8 text-ledger-ink/60">
                  Aexy is open source. Run it on your own infrastructure at no cost, or start on cloud and keep the option to move.
                </p>
              </div>
              <Link href="/pricing" className="inline-flex shrink-0 items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]">
                See pricing
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </section>
        )}

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 sm:p-10 lg:grid-cols-[0.7fr_1fr]">
            <div>
              <h2 className="font-display text-4xl font-semibold tracking-tight">Related paths</h2>
              <p className="mt-5 text-lg leading-8 text-ledger-ink/60">
                Route evaluators to the pages that match their buying stage, tool replacement question, or implementation need.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {relatedLinks.map(([label, href]) => (
                <Link key={href} href={href} className="flex items-center justify-between rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-5 text-sm font-semibold text-ledger-ink/75 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
                  {label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-4xl font-semibold tracking-tight">FAQ</h2>
            <div className="mt-8 space-y-4">
              {faqs.map(([question, answer]) => (
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
      </div>

    </LedgerPage>
  );
}

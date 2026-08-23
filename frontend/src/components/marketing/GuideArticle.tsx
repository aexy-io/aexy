import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { AuthorByline, defaultAuthor, organizationJsonLd, personJsonLd } from "@/components/marketing/AuthorByline";

export interface GuideSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface GuideArticleProps {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  keyFacts: string[];
  sections: GuideSection[];
  faqs: Array<[string, string]>;
  relatedLinks: Array<[string, string]>;
}

export function GuideArticle({
  slug,
  eyebrow,
  title,
  description,
  keyFacts,
  sections,
  faqs,
  relatedLinks,
}: GuideArticleProps) {
  const url = `https://aexy.io/guides/${slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: title,
        description,
        url,
        author: { "@id": `https://aexy.io/about#${defaultAuthor.slug}` },
        publisher: { "@id": "https://aexy.io/#organization" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://aexy.io" },
          // No intermediate "Guides" crumb: /guides has no index page and
          // returns 404, and a BreadcrumbList item pointing at a dead URL is a
          // structured-data error. Add the crumb back if a hub page ever ships.
          { "@type": "ListItem", position: 2, name: title, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
      personJsonLd(),
      organizationJsonLd(),
    ],
  };

  return (
    <LedgerPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="relative">
        <article className="px-4 pb-16 pt-32 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <nav className="mb-6 font-brand-mono text-sm text-ledger-ink/50" aria-label="Breadcrumb">
              <Link href="/" className="transition hover:text-ledger-green">Home</Link>
              <span className="mx-2 text-ledger-ink/45">/</span>
              <span className="text-ledger-ink/65">Guides</span>
              <span className="mx-2 text-ledger-ink/45">/</span>
              <span className="text-ledger-ink/65">{eyebrow}</span>
            </nav>

            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">{title}</h1>
            <p className="mt-6 text-lg leading-8 text-ledger-ink/65">{description}</p>

            <div className="mt-8">
              <AuthorByline />
            </div>

            <div className="mt-10 rounded-[2px] border border-ledger-green/25 bg-ledger-green/[0.06] p-6">
              <p className="font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">Key facts</p>
              <div className="mt-4 space-y-2.5">
                {keyFacts.map((fact) => (
                  <div key={fact} className="flex gap-3 text-sm leading-6 text-ledger-ink/75">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-ledger-green" />
                    {fact}
                  </div>
                ))}
              </div>
            </div>

            {sections.map((section) => (
              <section key={section.heading} className="mt-12">
                <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{section.heading}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 40)} className="mt-4 text-base leading-7 text-ledger-ink/65">
                    {paragraph}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="mt-4 space-y-2.5">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3 text-base leading-7 text-ledger-ink/65">
                        <CheckCircle2 className="mt-1.5 h-4 w-4 shrink-0 text-ledger-green" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <section className="mt-14">
              <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Frequently asked questions</h2>
              <div className="mt-6 space-y-4">
                {faqs.map(([question, answer]) => (
                  <div key={question} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6">
                    <h3 className="font-display text-lg font-semibold">{question}</h3>
                    <p className="mt-3 text-sm leading-6 text-ledger-ink/60">{answer}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-14 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 sm:p-8">
              <h2 className="font-display text-xl font-semibold">Keep reading</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {relatedLinks.map(([label, href]) => (
                  <Link key={href} href={href} className="flex items-center justify-between rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-4 text-sm font-semibold text-ledger-ink/75 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]">
                    {label}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>
            </section>

            <section className="mt-14 text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight">See it on your own stack.</h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-ledger-ink/60">
                Aexy is open source — self-host it free, or start on cloud in minutes.
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/login" className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]">
                  Start free
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/contact" className="inline-flex items-center justify-center rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
                  Book demo
                </Link>
              </div>
            </section>
          </div>
        </article>
      </div>

    </LedgerPage>
  );
}

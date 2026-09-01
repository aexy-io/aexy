import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";

import { LedgerPage } from "@/components/landing/LedgerPage";
import { organizationJsonLd } from "@/components/marketing/AuthorByline";

/**
 * One shape for a product page, so thirteen of them can exist at all.
 *
 * The sixteen pages that came first are each 250–370 lines of bespoke markup
 * that say the same five things in the same five places: a hero, a proof line,
 * a feature grid, a numbered "how it works", a closing CTA. Writing thirteen
 * more that way would mean thirteen more chances for the padding, the heading
 * scale and the hover treatment to drift — which is exactly what the app-side
 * work of this release spent its time undoing.
 *
 * The existing sixteen are deliberately left alone. Rewriting live marketing
 * pages to prove a point about consistency is a bad trade; they can move onto
 * this when one of them next needs editing anyway.
 */

export interface ProductFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface ProductStep {
  title: string;
  description: string;
}

export interface ProductSpec {
  label: string;
  value: string;
}

export interface ProductPageData {
  /** URL slug under /products. Used for the canonical. */
  slug: string;
  /** Small uppercase label above the title. */
  eyebrow: string;
  title: string;
  /** One sentence. Shown under the title and used as the meta description. */
  subtitle: string;
  /** Three or four short claims beside the CTAs. Keep them checkable. */
  proof: string[];
  features: ProductFeature[];
  /** The numbered walkthrough. Four steps reads best; three is fine. */
  how: { heading: string; blurb: string; steps: ProductStep[] };
  /** Optional dark pane of hard numbers or supported values. */
  specs?: { heading: string; items: ProductSpec[] };
  cta: {
    heading: string;
    blurb: string;
    /**
     * An extra link beside "Get started free", for a product that has something
     * live to look at. `/products/community` uses it to point at the actual
     * forum: a page that describes a public community and then offers only a
     * signup button is asking to be trusted about something it could simply
     * show.
     */
    secondary?: { href: string; label: string };
  };
}

/** Build the page's `metadata` from the same object that renders it. */
export function productMetadata(data: ProductPageData): Metadata {
  return {
    // The root layout's title.template appends " | Aexy", so this must not.
    title: data.title,
    description: data.subtitle,
    alternates: { canonical: `/products/${data.slug}` },
    openGraph: {
      title: data.title,
      description: data.subtitle,
      url: `/products/${data.slug}`,
      type: "website",
    },
  };
}

/**
 * `SoftwareApplication` + `BreadcrumbList`, which every hand-written product
 * page already emits and `marketingConversion.test.ts` requires.
 *
 * The breadcrumb stops at the page itself. There is no `/products` index —
 * a crumb pointing at one would be a structured-data link to a 404, which is
 * the exact thing that test's neighbouring case guards against.
 */
function productJsonLd(data: ProductPageData) {
  const url = `https://aexy.io/products/${data.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: `Aexy ${data.title}`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: data.subtitle,
        url,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Open-source self-hosted option available.",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Aexy", item: "https://aexy.io" },
          { "@type": "ListItem", position: 2, name: data.title, item: url },
        ],
      },
      organizationJsonLd(),
    ],
  };
}

export function ProductPageTemplate({ data }: { data: ProductPageData }) {
  return (
    <LedgerPage>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(data)) }}
      />
      {/* Hero */}
      <section className="px-6 pb-16 pt-20 md:pt-28">
        <div className="mx-auto max-w-4xl text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-[2px] border border-ledger-ink/12 bg-ledger-card px-3 py-1.5 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-green">
            {data.eyebrow}
          </span>
          <h1 className="mb-5 font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            {data.title}
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-ledger-ink/60">
            {data.subtitle}
          </p>

          <div className="mb-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
            >
              Get started free
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-medium text-ledger-ink transition hover:border-ledger-ink/50"
            >
              See pricing
            </Link>
          </div>

          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ledger-ink/55">
            {data.proof.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-ledger-green" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 md:grid-cols-2">
            {data.features.map((f) => (
              <div
                key={f.title}
                className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <f.icon className="mb-6 h-5 w-5 text-ledger-green" aria-hidden />
                <h2 className="mb-3 font-display text-xl font-semibold">{f.title}</h2>
                <p className="text-ledger-ink/65">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
              {data.how.heading}
            </h2>
            <p className="mb-8 max-w-2xl text-ledger-ink/65">{data.how.blurb}</p>
            <ol className="grid gap-6 sm:grid-cols-2">
              {data.how.steps.map((s, i) => (
                <li key={s.title} className="flex items-start gap-4">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-ledger-ink/25 bg-ledger-paper font-brand-mono text-sm text-ledger-green"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-medium">{s.title}</h3>
                    <p className="text-sm text-ledger-ink/55">{s.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Specs — the dark pane treatment reserved for product surfaces.
          `white/*` utilities are intentional inside bg-ledger-pane. */}
      {data.specs && (
        <section className="px-6 pb-20">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane text-[#E6EDE7]">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="font-brand-mono text-xs uppercase tracking-[0.14em] text-white/50">
                {data.specs.heading}
              </h2>
            </div>
            <dl className="divide-y divide-white/10">
              {data.specs.items.map((s) => (
                <div key={s.label} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-6 py-3.5">
                  <dt className="min-w-[12rem] text-sm text-white/50">{s.label}</dt>
                  <dd className="font-brand-mono text-sm text-white/85">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      {/* Close */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight">
            {data.cta.heading}
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-ledger-ink/60">{data.cta.blurb}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
            >
              Get started free
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            {data.cta.secondary && (
              <Link
                href={data.cta.secondary.href}
                className="inline-flex items-center justify-center gap-2 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
              >
                {data.cta.secondary.label}
              </Link>
            )}
          </div>
        </div>
      </section>
    </LedgerPage>
  );
}

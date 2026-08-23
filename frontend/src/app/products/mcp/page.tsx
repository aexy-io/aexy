import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Filter,
  KeyRound,
  Plug,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { BreadcrumbJsonLd } from "@/components/marketing/StructuredData";
import { ProductShot } from "@/components/marketing/ProductShot";
import mcpShot from "../../../../public/marketing/products/mcp@2x.webp";
import { McpChatPreview } from "@/components/landing/McpChatPreview";

/**
 * The public case for connecting an assistant to Aexy.
 *
 * A server component, so translations come from `getTranslations` and the title
 * from `generateMetadata` — a route cannot export both `metadata` and
 * `generateMetadata`, so the usual `export const metadata` is deliberately
 * absent here.
 *
 * The honest split this page has to make: **only ChatGPT gets the OAuth story.**
 * Claude, Cursor and Codex run the server locally with an API token that carries
 * everything the account can do. Collapsing the two into one "connect your
 * assistant, scoped and revocable" claim would be false for four of the five
 * clients, so the connect section states them separately.
 */

// Structure here, copy in messages/<locale>/marketingMcp.json.
const CAPABILITIES = [
  { key: "anyClient", icon: Plug },
  { key: "scoped", icon: KeyRound },
  { key: "filtered", icon: Filter },
  { key: "audit", icon: ShieldCheck },
] as const;

const PROMPTS = ["sprint", "standup", "crm", "ticket", "docs", "analytics"] as const;

const FAQ_KEYS = ["q1", "q2", "q3", "q4"] as const;

const SECURITY_POINTS = ["one", "two", "three"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketingMcp");
  const title = t("page.metaTitle");
  const description = t("page.metaDescription");
  const url = "https://aexy.io/products/mcp";

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  };
}

export default async function McpProductPage() {
  const t = await getTranslations("marketingMcp");

  // Built here rather than at module scope: the questions are translated, and
  // structured data frozen at module load would advertise English text beside
  // whatever the visitor is reading.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Aexy MCP Server",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: t("page.metaDescription"),
        url: "https://aexy.io/products/mcp",
      },
      {
        "@type": "FAQPage",
        "@id": "https://aexy.io/products/mcp#faq",
        mainEntity: FAQ_KEYS.map((key) => ({
          "@type": "Question",
          name: t(`page.faq.${key}.q`),
          acceptedAnswer: {
            "@type": "Answer",
            text: t(`page.faq.${key}.a`),
          },
        })),
      },
    ],
  };

  return (
    <LedgerPage>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BreadcrumbJsonLd trail={[{ name: "MCP", path: "/products/mcp" }]} />

      <div className="relative">
        {/* Hero */}
        <section className="px-4 pb-20 pt-32 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.95fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Plug className="h-4 w-4" />
                {t("page.badge")}
              </div>
              <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
                {t("page.h1")}
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-ledger-ink/65">
                {t("page.subhead")}
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  {t("page.ctaPrimary")}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/handbook/mcp"
                  className="inline-flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
                >
                  {t("page.ctaSecondary")}
                </Link>
              </div>
            </div>

            {/* Restyled into a framed dark plate by the .theme-ledger scope. */}
            <McpChatPreview />
          </div>
        </section>

        {/* Real screenshot of the in-app MCP page, captured by
            e2e/tools/capture-marketing-shots.ts. Copy lives in
            messages/<locale>/marketingMcp.json like the rest of this page. */}
        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl">
              <div className="mb-4 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                {t("shot.eyebrow")}
              </div>
              <h2 className="mb-4 font-display text-4xl font-semibold tracking-tight">
                {t("shot.heading")}
              </h2>
              <p className="text-lg leading-8 text-ledger-ink/65">{t("shot.body")}</p>
            </div>
            <ProductShot
              src={mcpShot}
              alt={t("shot.alt")}
              figure={t("shot.figure")}
              caption={t("shot.caption")}
            />
          </div>
        </section>

        {/* Prompts */}
        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-3xl font-display text-4xl font-semibold tracking-tight">
              {t("page.prompts.heading")}
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ledger-ink/65">
              {t("page.prompts.body")}
            </p>
            <div className="mt-10 grid gap-3 md:grid-cols-2">
              {PROMPTS.map((key) => (
                <div
                  key={key}
                  className="flex items-start gap-3 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5 text-ledger-ink/70"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ledger-green" />
                  <span>{t(`page.prompts.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-3xl font-display text-4xl font-semibold tracking-tight">
              {t("page.capabilities.heading")}
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {CAPABILITIES.map(({ key, icon: Icon }) => (
                <div
                  key={key}
                  className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
                >
                  <Icon className="h-5 w-5 text-ledger-green" />
                  <h3 className="mt-5 font-display text-xl font-semibold">
                    {t(`page.capabilities.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-ledger-ink/65">
                    {t(`page.capabilities.${key}.body`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Two ways to connect */}
        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-3xl font-display text-4xl font-semibold tracking-tight">
              {t("page.connect.heading")}
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ledger-ink/65">
              {t("page.connect.body")}
            </p>
            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[2px] border border-ledger-green/40 bg-ledger-card p-6 sm:p-8">
                <div className="mb-5 flex items-center gap-3">
                  <Plug className="h-5 w-5 text-ledger-green" />
                  <span className="rounded-[2px] bg-ledger-green/10 px-3 py-1 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-green">
                    {t("page.connect.remote.tag")}
                  </span>
                </div>
                <h3 className="font-display text-2xl font-semibold">
                  {t("page.connect.remote.title")}
                </h3>
                <p className="mt-3 text-sm leading-6 text-ledger-ink/65">
                  {t("page.connect.remote.body")}
                </p>
              </div>
              <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 sm:p-8">
                <div className="mb-5 flex items-center gap-3">
                  <Terminal className="h-5 w-5 text-ledger-ink/70" />
                  <span className="rounded-[2px] border border-ledger-ink/20 px-3 py-1 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-ink/60">
                    {t("page.connect.local.tag")}
                  </span>
                </div>
                <h3 className="font-display text-2xl font-semibold">
                  {t("page.connect.local.title")}
                </h3>
                <p className="mt-3 text-sm leading-6 text-ledger-ink/65">
                  {t("page.connect.local.body")}
                </p>
              </div>
            </div>
            <Link
              href="/handbook/mcp"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ledger-green transition hover:text-ledger-ink"
            >
              <BookOpen className="h-4 w-4" />
              {t("page.connect.guide")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Security */}
        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 sm:p-10 lg:grid-cols-[0.8fr_1fr]">
            <div>
              <ShieldCheck className="h-10 w-10 text-ledger-green" />
              <h2 className="mt-6 font-display text-4xl font-semibold tracking-tight">
                {t("page.security.heading")}
              </h2>
              <p className="mt-5 text-lg leading-8 text-ledger-ink/65">
                {t("page.security.body")}
              </p>
              <Link
                href="/security"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ledger-green transition hover:text-ledger-ink"
              >
                Security at Aexy
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-3">
              {SECURITY_POINTS.map((key) => (
                <div
                  key={key}
                  className="rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-5 text-ledger-ink/70"
                >
                  {t(`page.security.points.${key}`)}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center font-display text-4xl font-semibold tracking-tight">
              {t("page.faq.heading")}
            </h2>
            <div className="mt-10 space-y-4">
              {FAQ_KEYS.map((key) => (
                <div
                  key={key}
                  className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6"
                >
                  <h3 className="text-lg font-semibold">{t(`page.faq.${key}.q`)}</h3>
                  <p className="mt-3 text-sm leading-6 text-ledger-ink/60">
                    {t(`page.faq.${key}.a`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-ledger-ink/12 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              {t("page.finalCta.heading")}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ledger-ink/65">
              {t("page.finalCta.body")}
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]"
              >
                {t("page.ctaPrimary")}
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/handbook/mcp"
                className="inline-flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
              >
                {t("page.ctaSecondary")}
              </Link>
            </div>
          </div>
        </section>
      </div>

    </LedgerPage>
  );
}

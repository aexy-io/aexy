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
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";
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
    <div className="min-h-screen overflow-hidden bg-[#08090d] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.15),transparent_32%),radial-gradient(circle_at_75%_10%,rgba(34,211,238,0.12),transparent_30%)]" />
      <LandingHeader />

      <main className="relative">
        {/* Hero */}
        <section className="px-4 pb-20 pt-32 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.95fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-400/25 bg-teal-400/10 px-4 py-2 text-sm text-teal-200">
                <Plug className="h-4 w-4" />
                {t("page.badge")}
              </div>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
                {t("page.h1")}
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-white/62">
                {t("page.subhead")}
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black transition hover:bg-white/90"
                >
                  {t("page.ctaPrimary")}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/handbook/mcp"
                  className="inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 font-semibold text-white transition hover:bg-white/[0.08]"
                >
                  {t("page.ctaSecondary")}
                </Link>
              </div>
            </div>

            <McpChatPreview />
          </div>
        </section>

        {/* Prompts */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-3xl text-4xl font-semibold tracking-tight">
              {t("page.prompts.heading")}
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/58">
              {t("page.prompts.body")}
            </p>
            <div className="mt-10 grid gap-3 md:grid-cols-2">
              {PROMPTS.map((key) => (
                <div
                  key={key}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-white/68"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" />
                  <span>{t(`page.prompts.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-3xl text-4xl font-semibold tracking-tight">
              {t("page.capabilities.heading")}
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {CAPABILITIES.map(({ key, icon: Icon }) => (
                <div
                  key={key}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
                >
                  <Icon className="h-6 w-6 text-teal-300" />
                  <h3 className="mt-5 text-xl font-semibold">
                    {t(`page.capabilities.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-white/55">
                    {t(`page.capabilities.${key}.body`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Two ways to connect */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-3xl text-4xl font-semibold tracking-tight">
              {t("page.connect.heading")}
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/58">
              {t("page.connect.body")}
            </p>
            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-teal-400/25 bg-teal-400/[0.06] p-6 sm:p-8">
                <div className="mb-5 flex items-center gap-3">
                  <Plug className="h-6 w-6 text-teal-300" />
                  <span className="rounded-full bg-teal-400/15 px-3 py-1 text-xs font-medium text-teal-200">
                    {t("page.connect.remote.tag")}
                  </span>
                </div>
                <h3 className="text-2xl font-semibold">
                  {t("page.connect.remote.title")}
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/60">
                  {t("page.connect.remote.body")}
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
                <div className="mb-5 flex items-center gap-3">
                  <Terminal className="h-6 w-6 text-white/72" />
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/60">
                    {t("page.connect.local.tag")}
                  </span>
                </div>
                <h3 className="text-2xl font-semibold">
                  {t("page.connect.local.title")}
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/60">
                  {t("page.connect.local.body")}
                </p>
              </div>
            </div>
            <Link
              href="/handbook/mcp"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-teal-300 transition hover:text-teal-200"
            >
              <BookOpen className="h-4 w-4" />
              {t("page.connect.guide")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Security */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-10 lg:grid-cols-[0.8fr_1fr]">
            <div>
              <ShieldCheck className="h-10 w-10 text-teal-300" />
              <h2 className="mt-6 text-4xl font-semibold tracking-tight">
                {t("page.security.heading")}
              </h2>
              <p className="mt-5 text-lg leading-8 text-white/58">
                {t("page.security.body")}
              </p>
              <Link
                href="/security"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-teal-300 transition hover:text-teal-200"
              >
                Security at Aexy
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-3">
              {SECURITY_POINTS.map((key) => (
                <div
                  key={key}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5 text-white/68"
                >
                  {t(`page.security.points.${key}`)}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-4xl font-semibold tracking-tight">
              {t("page.faq.heading")}
            </h2>
            <div className="mt-10 space-y-4">
              {FAQ_KEYS.map((key) => (
                <div
                  key={key}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"
                >
                  <h3 className="text-lg font-semibold">{t(`page.faq.${key}.q`)}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/58">
                    {t(`page.faq.${key}.a`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              {t("page.finalCta.heading")}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/56">
              {t("page.finalCta.body")}
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black transition hover:bg-white/90"
              >
                {t("page.ctaPrimary")}
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/handbook/mcp"
                className="inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 font-semibold text-white transition hover:bg-white/[0.08]"
              >
                {t("page.ctaSecondary")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

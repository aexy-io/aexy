import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ChevronRight } from "lucide-react";
import { McpChatPreview } from "@/components/landing/McpChatPreview";
import { AuthRedirect } from "@/components/landing/home/AuthRedirect";
import { LedgerPage } from "@/components/landing/LedgerPage";
import { ProductTour } from "@/components/landing/home/ProductTour";
import { SectionHeading } from "@/components/landing/home/SectionHeading";
import { DiffStrip } from "@/components/landing/home/DiffStrip";
import { OsConsolePreview } from "@/components/landing/home/OsConsolePreview";
import {
  MCP_HOME_CARDS,
  buildHomepageJsonLd,
  comparisons,
  homepageFaqs,
  icpTracks,
} from "@/components/landing/home/homeContent";

// A server component: the marketing HTML is rendered on the server and stays
// crawlable, while the only client-side concerns — the mobile menu and the
// logged-in bounce — live in the shared LandingHeader and the AuthRedirect
// island. Header and footer are the same components every marketing page
// uses, so the chrome cannot drift between the homepage and the rest.
//
// The look is the "Open Ledger" brand: a light paper page where the product
// appears only inside dark panes, like plates in a technical manual. Paper,
// ink, and ledger-green tokens live in tailwind.config.ts; the .theme-ledger
// scope in globals.css restyles the shared McpChatPreview without forking it.

const pageTitle = "Aexy — AI Company OS for Engineering, CRM, HR & GTM";
const pageDescription =
  "The AI company OS for engineering, CRM, GTM, people, docs, workflows, and agents. Open source and self-hostable for modern teams.";

export const metadata: Metadata = {
  title: { absolute: pageTitle },
  description: pageDescription,
  alternates: { canonical: "https://aexy.io/" },
  openGraph: {
    type: "website",
    siteName: "Aexy",
    url: "https://aexy.io",
    title: pageTitle,
    description: pageDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

// Real open-source facts only — the trust layer of this page is "read the
// source", never invented logos or numbers.
const colophonFacts = ["AGPL-3.0 licensed", "Self-hostable", "MCP server built in"] as const;

const agentLog = [
  ["LOG/01", "Tool access", "CRM, email, enrichment, Slack, workflows, docs, and company records."],
  ["LOG/02", "Policy gates", "Require approval, block tools, restrict fields, rate-limit actions, and cap spend."],
  ["LOG/03", "Automation hooks", "Invoke agents when a lead replies, a deal changes, a ticket arrives, or a workflow branches."],
  ["LOG/04", "Audit history", "Every run, tool call, policy decision, and config change is visible."],
] as const;

const openSourceFacts = [
  ["Self-host free", "Run the full OS on your own infrastructure at no cost."],
  ["AGPL-3.0 licensed", "The entire codebase is public — read how every feature works."],
  ["Data export", "Your records, docs, and workflows are exportable, always."],
  ["Commercial cloud", "Managed hosting when you want speed over ops."],
] as const;

export default async function Home() {
  // The only translated copy on this page. The rest of the marketing surface is
  // hardcoded English; new copy goes through i18n so translating marketing later
  // is a copy pass rather than a refactor.
  const tMcp = await getTranslations("marketingMcp");

  // Slotted in after the agents question so the two AI answers sit together.
  // Feeds both the visible list and the FAQPage structured data from one source,
  // so the two cannot disagree.
  const faqs = [
    ...homepageFaqs.slice(0, 4),
    { question: tMcp("faq.question"), answer: tMcp("faq.answer") },
    ...homepageFaqs.slice(4),
  ];

  return (
    <LedgerPage>
      <AuthRedirect />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildHomepageJsonLd(faqs)) }}
      />


      {/* SYS/01 — hero */}
      <section className="relative px-4 pb-16 pt-28 sm:px-6 sm:pb-24 sm:pt-36">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.86fr]">
          <div>
            <p className="mb-5 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
              SYS/01 — Open-source company OS
            </p>
            <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Replace the stack. Keep the context.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-ledger-ink/70 sm:text-xl">
              Aexy is an open-source company OS — CRM, sprints, workflows, docs, and people in one
              system your team, your AI agents, and the assistant you already use can actually
              share. Self-host it, or let us run it.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 text-base font-semibold text-ledger-paper transition hover:bg-[#095A31]"
              >
                Start free
                <ArrowRight className="h-5 w-5" />
              </Link>
              {/* The second CTA is the self-host path, not a sales call. Someone
                  who arrives from a repository or a link about open source is
                  here to run it, and "Book demo" turns that person away at the
                  top of the page. The sales CTA is still on the closing block,
                  where a buyer evaluating it will look. */}
              <Link
                href="/handbook/guides/getting-started"
                className="inline-flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-7 py-4 text-base font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
              >
                Self-host it
                <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ledger-ink/55">
              <span>Works with Google, GitHub, and Microsoft accounts</span>
              <span className="text-ledger-ink/25">/</span>
              <Link href="/products/mcp" className="hover:text-ledger-green transition">
                {tMcp("hero.linkLabel")} →
              </Link>
              <span className="text-ledger-ink/25">/</span>
              <a href="https://github.com/aexy-io/aexy" className="hover:text-ledger-green transition">View source</a>
            </div>
            <div className="mt-8">
              <DiffStrip />
            </div>
          </div>

          <OsConsolePreview />
        </div>
      </section>

      {/* Colophon strip — the proof layer, one ruled line of checkable facts */}
      <section className="relative border-y border-ledger-ink/12 bg-ledger-card px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/60">
          {colophonFacts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
          <a
            href="https://github.com/aexy-io/aexy"
            className="normal-case text-ledger-green hover:text-ledger-ink transition"
          >
            github.com/aexy-io/aexy →
          </a>
        </div>
      </section>

      {/* SYS/02 — platform (becomes the screenshot product tour) */}
      <section id="platform" className="relative scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            locator="SYS/02 — Platform"
            title="Every team's system. One place."
            lede="Aexy is not another point solution. It connects the systems companies normally buy separately, then gives AI agents governed access to that shared context."
          />
          <ProductTour />
        </div>
      </section>

      {/* SYS/03 — who it's for */}
      <section id="solutions" className="relative scroll-mt-24 border-t border-ledger-ink/12 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            locator="SYS/03 — Who it's for"
            title="Start where it hurts most."
            lede="You don't adopt a company OS in one day. Start with the workflow your team is fighting today, then expand into the shared operating layer."
          />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {icpTracks.map(({ label, icon: Icon, pain, replacesTools, features, href, compare }) => (
              <article
                key={label}
                className="flex flex-col rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <Icon className="mb-4 h-5 w-5 text-ledger-green" />
                <h3 className="font-display text-2xl font-semibold">{label}</h3>
                <p className="mt-3 text-sm leading-6 text-ledger-ink/65">{pain}</p>
                <div className="mt-5 space-y-2 border-t border-ledger-ink/12 pt-4">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-ledger-ink/75">
                      <span className="font-brand-mono text-ledger-green">+</span>
                      {feature}
                    </div>
                  ))}
                </div>
                <div className="mt-4 font-brand-mono text-xs leading-6 text-ledger-red">
                  {replacesTools.map((tool) => (
                    <div key={tool}>- {tool}</div>
                  ))}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-6">
                  <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ledger-green transition hover:text-ledger-ink">
                    See how it works
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  {compare.map((c) => (
                    <Link key={c.href} href={c.href} className="text-sm text-ledger-ink/55 underline-offset-4 transition hover:text-ledger-ink hover:underline">
                      {c.label}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SYS/04 — agents, written as the audit log they leave behind */}
      <section id="agents" className="relative scroll-mt-24 border-t border-ledger-ink/12 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1fr]">
          <SectionHeading
            locator="SYS/04 — AI agents"
            title="Agents with real access — and a paper trail."
            lede="Aexy agents can read CRM history, draft emails, enrich accounts, update records, call workflows, and escalate to humans through policy gates."
          />
          <div className="divide-y divide-ledger-ink/12 border-y border-ledger-ink/12">
            {agentLog.map(([tag, title, body]) => (
              <div key={tag} className="grid gap-1 py-5 sm:grid-cols-[110px_1fr] sm:gap-6">
                <span className="font-brand-mono text-xs font-medium uppercase tracking-[0.14em] text-ledger-green">{tag}</span>
                <div>
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-ledger-ink/65">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SYS/05 — MCP. Sits after #agents on purpose: that section establishes
          governed tool access inside the workspace, and this is the same claim
          turned outward — the agent can be one the visitor already pays for.
          Strings stay in marketingMcp so en + hi keep working untouched. */}
      <section id="mcp" className="relative scroll-mt-24 border-t border-ledger-ink/12 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.9fr_1fr]">
          <div>
            <p className="mb-4 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
              SYS/05 — {tMcp("home.eyebrow")}
            </p>
            <h2 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              {tMcp("home.heading")}
            </h2>
            <p className="mt-5 text-lg leading-8 text-ledger-ink/65">{tMcp("home.body")}</p>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {MCP_HOME_CARDS.map(({ key, icon: Icon }) => (
                <div key={key} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5">
                  <Icon className="mb-3 h-5 w-5 text-ledger-green" />
                  <h3 className="text-base font-semibold">
                    {tMcp(`home.cards.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-ledger-ink/65">
                    {tMcp(`home.cards.${key}.body`)}
                  </p>
                </div>
              ))}
            </div>
            <Link
              href="/products/mcp"
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-ledger-green transition hover:text-ledger-ink"
            >
              {tMcp("home.cta")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <McpChatPreview />
        </div>
      </section>

      {/* SYS/06 — open source, the trust centerpiece */}
      <section className="relative border-t border-ledger-ink/12 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.9fr_1fr]">
          <div>
            <SectionHeading
              locator="SYS/06 — Open source"
              title="Nothing to hide. Read the source."
              lede="Aexy is open source and self-hostable, with exportable data and auditable logic. Use cloud to move fast or run it on your own infrastructure."
            />
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {openSourceFacts.map(([item, detail]) => (
                <div key={item} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5">
                  <div className="text-base font-semibold">{item}</div>
                  <p className="mt-1.5 text-sm leading-6 text-ledger-ink/60">{detail}</p>
                </div>
              ))}
            </div>
          </div>
          {/* The install command is the README's quick start, verbatim — a
              claim anyone can run, which is the whole point of the section. */}
          <figure>
            <div className="overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane font-brand-mono text-sm leading-7 text-[#E6EDE7]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <span className="text-[11px] uppercase tracking-[0.14em] text-white/55">FIG. 02 — Your infrastructure</span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-ledger-mint">AGPL-3.0</span>
              </div>
              <div className="px-5 py-5">
                <div>
                  <span className="text-white/40">$ </span>
                  git clone https://github.com/aexy-io/aexy
                </div>
                <div>
                  <span className="text-white/40">$ </span>
                  cd aexy && docker-compose up -d
                </div>
                <div className="mt-2 text-white/45"># backend :8000 · frontend :3000 · temporal :8080</div>
              </div>
            </div>
            <figcaption className="mt-2.5 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-ink/45">
              The full OS, on your own machines
            </figcaption>
          </figure>
        </div>
      </section>

      {/* SYS/07 — compare, as ledger rows */}
      <section id="compare" className="relative scroll-mt-24 border-t border-ledger-ink/12 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            locator="SYS/07 — Compare"
            title="Side-by-side with the tool you use today."
            lede="Aexy replaces point tools one workflow at a time. See exactly what you gain — and what changes — against the tool your team uses today."
          />
          <div className="mt-10 divide-y divide-ledger-ink/12 border-y border-ledger-ink/12">
            {comparisons.map(({ name, href, gap }) => (
              <Link
                key={href}
                href={href}
                className="group grid items-baseline gap-1 py-5 transition hover:bg-ledger-card sm:grid-cols-[220px_1fr_auto] sm:gap-6"
              >
                <h3 className="font-display text-xl font-semibold">Aexy vs {name}</h3>
                <p className="text-sm leading-6 text-ledger-ink/60">{gap}</p>
                <ArrowRight className="hidden h-5 w-5 justify-self-end text-ledger-ink/35 transition group-hover:translate-x-1 group-hover:text-ledger-green sm:block" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* SYS/08 — FAQ (feeds the FAQPage JSON-LD above from the same list) */}
      <section className="relative border-t border-ledger-ink/12 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            locator="SYS/08 — FAQ"
            title="Before you replace the stack."
            align="center"
          />
          <div className="mt-10 divide-y divide-ledger-ink/12 border-y border-ledger-ink/12">
            {faqs.map((faq) => (
              <div key={faq.question} className="py-6">
                <h3 className="text-lg font-semibold">{faq.question}</h3>
                <p className="mt-3 text-sm leading-6 text-ledger-ink/65">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative border-t border-ledger-ink/12 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Adopt it one workflow at a time.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ledger-ink/65">
            Bring engineering, GTM, people, knowledge, and AI agents into one system of record —
            starting with the workflow that hurts today.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/login" className="inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-7 py-4 font-semibold text-ledger-paper transition hover:bg-[#095A31]">
              Start free
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/contact" className="inline-flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-7 py-4 font-semibold text-ledger-ink transition hover:border-ledger-ink/50">
              Book demo
            </Link>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

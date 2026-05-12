import Link from "next/link";
import { ArrowRight, CheckCircle2, GitBranch } from "lucide-react";
import { LandingFooter, LandingHeader } from "@/components/landing/LandingHeader";

export interface SeoLandingPageProps {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta?: string;
  secondaryCta?: string;
  proofPoints: string[];
  sections: Array<{
    title: string;
    body: string;
    items: string[];
  }>;
  faqs: Array<[string, string]>;
  relatedLinks: Array<[string, string]>;
  schema: Record<string, unknown>;
}

export function SeoLandingPage({
  eyebrow,
  title,
  description,
  primaryCta = "Book demo",
  secondaryCta = "See company OS",
  proofPoints,
  sections,
  faqs,
  relatedLinks,
  schema,
}: SeoLandingPageProps) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#08090d] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.13),transparent_32%)]" />
      <LandingHeader />

      <main className="relative">
        <section className="px-4 pb-16 pt-32 sm:px-6">
          <div className="mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70">
              <GitBranch className="h-4 w-4 text-cyan-300" />
              {eyebrow}
            </div>
            <h1 className="text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">{title}</h1>
            <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-white/62">{description}</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/contact" className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black">
                {primaryCta}
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/ai-company-os" className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 font-semibold text-white">
                {secondaryCta}
              </Link>
            </div>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {proofPoints.map((point) => (
              <div key={point} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-white/65">
                <CheckCircle2 className="mb-4 h-5 w-5 text-emerald-300" />
                {point}
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {sections.map((section) => (
              <div key={section.title} className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
                <h2 className="text-2xl font-semibold">{section.title}</h2>
                <p className="mt-4 text-sm leading-6 text-white/56">{section.body}</p>
                <div className="mt-6 space-y-3">
                  {section.items.map((item) => (
                    <div key={item} className="flex gap-3 text-sm leading-6 text-white/62">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-10 lg:grid-cols-[0.7fr_1fr]">
            <div>
              <h2 className="text-4xl font-semibold tracking-tight">Related paths</h2>
              <p className="mt-5 text-lg leading-8 text-white/56">
                Route evaluators to the pages that match their buying stage, tool replacement question, or implementation need.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {relatedLinks.map(([label, href]) => (
                <Link key={href} href={href} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06]">
                  {label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-4xl font-semibold tracking-tight">FAQ</h2>
            <div className="mt-8 space-y-4">
              {faqs.map(([question, answer]) => (
                <div key={question} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
                  <h3 className="text-xl font-semibold">{question}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/58">{answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

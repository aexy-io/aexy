import Link from "next/link";
import { ArrowRight, CheckCircle2, GitBranch } from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

export interface ComparisonPageProps {
  competitor: string;
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
    "@type": "FAQPage",
    mainEntity: pageFaqs.map(([name, text]) => ({
      "@type": "Question",
      name,
      acceptedAnswer: { "@type": "Answer", text },
    })),
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#08090d] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.13),transparent_32%)]" />
      <LandingHeader />

      <main className="relative">
        <section className="px-4 pb-20 pt-32 sm:px-6">
          <div className="mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70">
              <GitBranch className="h-4 w-4 text-cyan-300" />
              {eyebrow}
            </div>
            <h1 className="text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">{title}</h1>
            <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-white/62">{description}</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/contact" className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black">
                Book demo
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/ai-company-os" className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 font-semibold text-white">
                See company OS
              </Link>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2">
            <BestFor title="Aexy is best for" items={aexyBestFor} />
            <BestFor title={`${competitor} is best for`} items={competitorBestFor} />
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
            <div className="grid grid-cols-3 border-b border-white/10 px-5 py-4 text-sm font-semibold text-white/55">
              <div>Decision area</div>
              <div>Aexy</div>
              <div>{competitor}</div>
            </div>
            {rows.map(([area, aexy, other]) => (
              <div key={area} className="grid grid-cols-1 gap-3 border-b border-white/10 px-5 py-5 last:border-b-0 md:grid-cols-3">
                <div className="font-semibold">{area}</div>
                <div className="text-sm leading-6 text-white/62">{aexy}</div>
                <div className="text-sm leading-6 text-white/50">{other}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-10 lg:grid-cols-[0.75fr_1fr]">
            <div>
              <h2 className="text-4xl font-semibold tracking-tight">Migration path</h2>
              <p className="mt-5 text-lg leading-8 text-white/56">
                Aexy does not require a rip-and-replace rollout. Start with the workflow that hurts most, then move more company context into the operating layer.
              </p>
            </div>
            <div className="space-y-3">
              {migration.map((step, index) => (
                <div key={step} className="flex gap-4 rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-black">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-white/65">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-4xl font-semibold tracking-tight">FAQ</h2>
            <div className="mt-8 space-y-4">
              {pageFaqs.map(([question, answer]) => (
                <div key={question} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
                  <h3 className="text-xl font-semibold">{question}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/58">{answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 text-center sm:px-6">
          <h2 className="text-4xl font-semibold tracking-tight">Compare with your real stack.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/56">
            We will map your current tools, identify the first migration workflow, and show where Aexy replaces or connects the stack.
          </p>
          <Link href="/contact" className="mt-8 inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black">
            Book comparison call
            <ArrowRight className="h-5 w-5" />
          </Link>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

function BestFor({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3 text-sm leading-6 text-white/62">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

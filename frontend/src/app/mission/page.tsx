"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LedgerPage } from "@/components/landing/LedgerPage";


// "Open Ledger" brand: paper page, ink text, ledger-green as the only accent.
// The single dark plate below is the deliberate exception.
export default function MissionPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="relative px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <p className="mb-5 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
              Our Mission
            </p>
            <h1 className="mb-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ledger-ink md:text-5xl lg:text-6xl">
              Aexy is on a mission to bring{" "}
              <span className="text-ledger-green">
                positive change.
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-xl leading-8 text-ledger-ink/65">
              We are building world-class tools actually accessible for everyone using AI.
            </p>
            <p className="mt-6 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/55">
              Bhanu Pratap Chaudhary
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="relative px-6 py-12">
        <div className="mx-auto max-w-3xl">
          {/* Hero plate. Deliberately dark: the one product-pane note on this
              page, styled like a plate in a technical manual. */}
          <figure className="mb-16">
            <div className="flex h-64 items-center justify-center overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane">
              <div className="font-brand-mono text-xs uppercase tracking-[0.18em] text-white/55">
                Building the future
              </div>
            </div>
          </figure>

          {/* Opening */}
          <div className="mb-16">
            <p className="text-xl leading-relaxed text-ledger-ink/75">
              Humanity has progressed so far, yet there are so many stories that are buried under the status quo.
              Aexy aims to bring about social change by enabling people to build better software & reducing the
              friction involved in creating world-class tools that were once only accessible to giants like Google,
              Microsoft, and Salesforce.
            </p>
          </div>

          {/* Democratize */}
          <div className="mb-16">
            <h2 className="mb-6 font-display text-2xl font-semibold tracking-tight text-ledger-ink md:text-3xl">
              Democratize software creation
            </h2>
            <p className="text-lg leading-relaxed text-ledger-ink/70">
              Aexy is started to challenge the existing enterprise software giants and give access to
              cutting-edge engineering tools in the hands of everyone. Let the ideas and innovation flow
              throughout Earth and let humanity progress.
            </p>
          </div>

          {/* Quote Block */}
          <div className="relative my-16 border-l-2 border-ledger-green pl-6">
            <p className="font-display text-xl leading-relaxed text-ledger-ink/85 md:text-2xl">
              World needs to be shown that good companies can be created by good people with good culture
              without kalanick, jobs like toxicity & negativity.
            </p>
          </div>

          {/* Love over fear */}
          <div className="mb-16">
            <p className="mb-6 text-lg leading-relaxed text-ledger-ink/70">
              The world believes that love cannot trump over fear, history teaches us otherwise and we want
              to use love to transcend all color, caste, religion & gender boundaries and create a world
              where no kepler has to die, because no one believed in him. Aexy will create a new world of innovators.
            </p>
            <p className="text-lg leading-relaxed text-ledger-ink/70">
              We personally believe in no rules, apart from the laws imposed by nature, though for guiding
              principle we have adopted a very simple principle - <span className="font-medium text-ledger-ink">We don&apos;t
              make money or take advantage of people in need or suffering.</span> Thanks to AI, we don&apos;t want
              and need a lot of money to bring about change.
            </p>
          </div>

          {/* Who we work with */}
          <div className="mb-16">
            <h2 className="mb-6 font-display text-2xl font-semibold tracking-tight text-ledger-ink md:text-3xl">
              Who we work with
            </h2>
            <p className="mb-6 text-xl leading-relaxed text-ledger-ink/75">
              We plan to work with everyone who believe in this mission and are open to transparency & accountability.
            </p>
            <p className="text-lg leading-relaxed text-ledger-ink/70">
              This journey is not for light hearted people, as the reality might strike you that walking the
              right path requires a straight spine that only a few have retained. Please don&apos;t take this lightly,
              we are building a world of optimists, who believe the change is possible.
            </p>
          </div>

          {/* Long Term Vision */}
          <div className="mb-16">
            <h2 className="mb-6 font-display text-2xl font-semibold tracking-tight text-ledger-ink md:text-3xl">
              Our Long Term Vision
            </h2>
            <p className="mb-6 text-xl leading-relaxed text-ledger-ink/75">
              We are actually building the resources for the future generations, so that disadvantaged people
              in India & all over the world are no longer restricted by the technical challenges and lack of
              access to information & resources.
            </p>
            <p className="mb-6 text-lg leading-relaxed text-ledger-ink/70">
              This is Aexy&apos;s true & bold vision, everything in between is being done to ensure Aexy is able
              to actually solve real problems instead of pretending to connect people while filling up their
              coffers at any cost.
            </p>
            <p className="text-lg leading-relaxed text-ledger-ink/70">
              In the meantime, we are working towards reducing barriers to entry for high-quality software
              development. Aexy could empower a diverse array of voices, fostering a more inclusive technology
              landscape. This aligns with the theories on technology democratization and the public sphere,
              suggesting that broader access to production tools can enhance democratic discourse and representation.
            </p>
          </div>
        </div>
      </section>

      {/* Quote Section */}
      <section className="relative border-t border-ledger-ink/12 px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-12">
            <p className="mb-6 font-display text-2xl font-semibold leading-relaxed text-ledger-ink md:text-3xl">
              &ldquo;Big tech does not have a monopoly on big software. We can build whatever we want.&rdquo;
            </p>
            <p className="font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/55">@awesomekling</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ledger-ink/12 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-6 font-display text-3xl font-semibold tracking-tight text-ledger-ink md:text-4xl">
            Work at Aexy
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-xl leading-8 text-ledger-ink/65">
            Join us in building the future of engineering tools.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
            >
              Get Started
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/manifesto"
              className="flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
            >
              Read the Manifesto
            </Link>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}

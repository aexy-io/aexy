"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function MissionPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6 relative">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500/20 to-purple-500/20 border border-primary-500/30 rounded-full text-primary-400 text-sm mb-6">
              Our Mission
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
              Aexy is on a mission to bring{" "}
              <span className="bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
                positive change.
              </span>
            </h1>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">
              We are building world-class tools actually accessible for everyone using AI.
            </p>
            <p className="text-white/40 text-sm mt-6">
              Bhanu Pratap Chaudhary
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12 px-6 relative">
        <div className="max-w-3xl mx-auto">
          {/* Hero Image */}
          <div className="relative mb-16 rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] to-transparent z-10" />
            <div className="h-64 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
              <div className="text-white/20 text-sm">Building the future</div>
            </div>
          </div>

          {/* Opening */}
          <div className="prose prose-invert prose-lg max-w-none mb-16">
            <p className="text-xl text-white/80 leading-relaxed">
              Humanity has progressed so far, yet there are so many stories that are buried under the status quo.
              Aexy aims to bring about social change by enabling people to build better software & reducing the
              friction involved in creating world-class tools that were once only accessible to giants like Google,
              Microsoft, and Salesforce.
            </p>
          </div>

          {/* Democratize */}
          <div className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
              Democratize software creation
            </h2>
            <p className="text-white/70 leading-relaxed text-lg">
              Aexy is started to challenge the existing enterprise software giants and give access to
              cutting-edge engineering tools in the hands of everyone. Let the ideas and innovation flow
              throughout Earth and let humanity progress.
            </p>
          </div>

          {/* Quote Block */}
          <div className="relative my-16 pl-6 border-l-4 border-primary-500">
            <p className="text-xl md:text-2xl text-white/90 italic leading-relaxed">
              World needs to be shown that good companies can be created by good people with good culture
              without kalanick, jobs like toxicity & negativity.
            </p>
          </div>

          {/* Love over fear */}
          <div className="mb-16">
            <p className="text-white/70 leading-relaxed text-lg mb-6">
              The world believes that love cannot trump over fear, history teaches us otherwise and we want
              to use love to transcend all color, caste, religion & gender boundaries and create a world
              where no kepler has to die, because no one believed in him. Aexy will create a new world of innovators.
            </p>
            <p className="text-white/70 leading-relaxed text-lg">
              We personally believe in no rules, apart from the laws imposed by nature, though for guiding
              principle we have adopted a very simple principle - <span className="text-white font-medium">We don&apos;t
              make money or take advantage of people in need or suffering.</span> Thanks to AI, we don&apos;t want
              and need a lot of money to bring about change.
            </p>
          </div>

          {/* Who we work with */}
          <div className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
              Who we work with
            </h2>
            <p className="text-xl text-white/80 leading-relaxed mb-6">
              We plan to work with everyone who believe in this mission and are open to transparency & accountability.
            </p>
            <p className="text-white/70 leading-relaxed text-lg">
              This journey is not for light hearted people, as the reality might strike you that walking the
              right path requires a straight spine that only a few have retained. Please don&apos;t take this lightly,
              we are building a world of optimists, who believe the change is possible.
            </p>
          </div>

          {/* Long Term Vision */}
          <div className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
              Our Long Term Vision
            </h2>
            <p className="text-xl text-white/80 leading-relaxed mb-6">
              We are actually building the resources for the future generations, so that disadvantaged people
              in India & all over the world are no longer restricted by the technical challenges and lack of
              access to information & resources.
            </p>
            <p className="text-white/70 leading-relaxed text-lg mb-6">
              This is Aexy&apos;s true & bold vision, everything in between is being done to ensure Aexy is able
              to actually solve real problems instead of pretending to connect people while filling up their
              coffers at any cost.
            </p>
            <p className="text-white/70 leading-relaxed text-lg">
              In the meantime, we are working towards reducing barriers to entry for high-quality software
              development. Aexy could empower a diverse array of voices, fostering a more inclusive technology
              landscape. This aligns with the theories on technology democratization and the public sphere,
              suggesting that broader access to production tools can enhance democratic discourse and representation.
            </p>
          </div>
        </div>
      </section>

      {/* Quote Section */}
      <section className="py-24 px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-primary-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-12 border border-white/10">
              <p className="text-2xl md:text-3xl text-white font-medium leading-relaxed mb-6">
                &ldquo;Big tech does not have a monopoly on big software. We can build whatever we want.&rdquo;
              </p>
              <p className="text-white/50">@awesomekling</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Work at Aexy
          </h2>
          <p className="text-xl text-white/50 mb-10 max-w-2xl mx-auto">
            Join us in building the future of engineering tools.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            >
              Get Started
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <Link
              href="/manifesto"
              className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              Read the Manifesto
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, Heart, Code2, Globe, Sparkles } from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const VALUES = [
  {
    icon: Heart,
    title: "Transparency",
    desc: "Open-source code, public roadmap, honest communication.",
    color: "from-rose-500 to-pink-500",
  },
  {
    icon: Code2,
    title: "Build for builders",
    desc: "We make tools we want to use ourselves. Engineers first.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Globe,
    title: "Accessible to all",
    desc: "World-class engineering software, free for anyone to self-host.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Sparkles,
    title: "Optimism in practice",
    desc: "We believe better software makes better organizations.",
    color: "from-purple-500 to-violet-500",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      <section className="pt-32 pb-16 px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500/20 to-purple-500/20 border border-primary-500/30 rounded-full text-primary-400 text-sm mb-6">
            About Aexy
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            We&apos;re building the{" "}
            <span className="bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
              open-source operating system
            </span>{" "}
            for engineering organizations.
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            One platform that connects sprint planning, performance, hiring, and revenue —
            transparent by default, free to self-host.
          </p>
        </div>
      </section>

      <section className="py-12 px-6 relative">
        <div className="max-w-3xl mx-auto">
          <div className="prose prose-invert prose-lg max-w-none mb-16">
            <p className="text-xl text-white/80 leading-relaxed">
              Engineering teams are buried under disconnected tools — Jira here, Lattice there,
              HubSpot for revenue, Notion for docs, a separate vendor for everything else.
              Each one charges per seat. Each one owns your data.
            </p>
            <p className="text-xl text-white/80 leading-relaxed mt-6">
              Aexy is the alternative: one open-source platform where the work, the team, and
              the customer all live together. Self-host it free, forever. Or use the cloud
              and pay only for what you actually need.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
              What we believe
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="group relative">
                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all h-full">
                  <div className={`p-3 bg-gradient-to-br ${color} rounded-2xl shadow-lg w-fit mb-4`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Read more
          </h2>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/story"
              className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              Our Story
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/mission"
              className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              Our Mission
            </Link>
            <Link
              href="/manifesto"
              className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              Engineering OS Manifesto
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

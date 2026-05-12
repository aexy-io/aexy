"use client";

import Link from "next/link";
import { ArrowRight, Briefcase, Globe, Code2, Heart } from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const PRINCIPLES = [
  {
    icon: Globe,
    title: "Remote-first",
    desc: "Work from anywhere. We optimize for written communication and async work.",
  },
  {
    icon: Code2,
    title: "Build in the open",
    desc: "Most of our code, roadmap, and decisions are public. You ship to a real audience.",
  },
  {
    icon: Heart,
    title: "Sustainable pace",
    desc: "We don't celebrate burnout. We hire people we trust and let them work like adults.",
  },
];

export default function CareersPage() {
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
            <Briefcase className="h-4 w-4" />
            Careers
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            Help us build the{" "}
            <span className="bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
              AI company OS
            </span>
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            We&apos;re a small team building the workspace companies will use to run engineering,
            GTM, people, knowledge, workflows, and AI agents.
          </p>
        </div>
      </section>

      <section className="py-16 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {PRINCIPLES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all">
                <div className="p-3 bg-gradient-to-br from-primary-500 to-purple-500 rounded-2xl shadow-lg w-fit mb-4">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 relative">
        <div className="max-w-3xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-emerald-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-12 border border-white/10 text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                No open roles right now
              </h2>
              <p className="text-white/60 leading-relaxed mb-8 max-w-xl mx-auto">
                We don&apos;t have public roles posted at the moment, but we&apos;re always
                interested in talking to exceptional engineers, designers, and operators
                who care about open source.
              </p>

              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <a
                  href="mailto:careers@aexy.io?subject=Open%20Application"
                  className="group inline-flex items-center justify-center gap-3 bg-white text-black px-6 py-3 rounded-full text-sm font-semibold transition-all hover:scale-105"
                >
                  Send us your story
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
                <a
                  href="https://github.com/aexy-io/aexy"
                  className="group bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-full text-sm font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
                >
                  <SiGithub className="h-4 w-4" />
                  Contribute on GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

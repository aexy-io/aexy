"use client";

import Link from "next/link";
import { ArrowRight, Rss } from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      <section className="pt-32 pb-16 px-6 relative">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500/20 to-purple-500/20 border border-primary-500/30 rounded-full text-primary-400 text-sm mb-6">
            <Rss className="h-4 w-4" />
            Blog
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            Notes on building an{" "}
            <span className="bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
              open AI company OS
            </span>
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            Company operations, AI agents, product thinking, engineering culture, and lessons from building in the open.
          </p>
        </div>
      </section>

      <section className="py-16 px-6 relative">
        <div className="max-w-3xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-emerald-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-12 border border-white/10 text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                The blog is coming soon
              </h2>
              <p className="text-white/60 leading-relaxed mb-8 max-w-xl mx-auto">
                We&apos;re writing our first posts. In the meantime, our work happens
                in the open — every commit, every roadmap discussion, every release
                is on GitHub.
              </p>

              <div className="flex flex-col sm:flex-row justify-center gap-4 mb-6">
                <a
                  href="https://github.com/aexy-io/aexy"
                  className="group inline-flex items-center justify-center gap-3 bg-white text-black px-6 py-3 rounded-full text-sm font-semibold transition-all hover:scale-105"
                >
                  <SiGithub className="h-4 w-4" />
                  Follow development on GitHub
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
                <Link
                  href="/changelog"
                  className="group bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-full text-sm font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
                >
                  Read the changelog
                </Link>
              </div>

              <p className="text-white/40 text-xs">
                Want to be notified when we publish?{" "}
                <Link href="/contact" className="text-primary-400 hover:text-primary-300 transition">
                  Get in touch
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

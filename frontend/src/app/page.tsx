"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GitBranch,
  Users,
  TrendingUp,
  Target,
  Zap,
  BarChart3,
  Shield,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Layout,
  RefreshCw,
  Layers,
  GitPullRequest,
  Bot,
  Rocket,
  Star,
  ChevronRight,
  Github,
  GraduationCap,
  Cpu,
  Activity,
  ClipboardCheck,
  Phone,
  Calendar,
  Mail,
  Building2,
  UserPlus,
  Inbox,
} from "lucide-react";
import Link from "next/link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const githubLoginUrl = `${API_BASE_URL}/auth/github/login`;
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      router.replace("/dashboard");
    } else {
      setIsChecking(false);
    }
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse delay-1000" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-emerald-500/8 rounded-full blur-[100px] animate-pulse delay-500" />
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-primary-500 blur-lg opacity-50" />
              <div className="relative p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl">
                <GitBranch className="h-6 w-6 text-white" />
              </div>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
              Devograph
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="#pillars" className="text-white/60 hover:text-white transition text-sm">
              Platform
            </Link>
            <Link href="#features" className="text-white/60 hover:text-white transition text-sm">
              Features
            </Link>
            <Link href="#integrations" className="text-white/60 hover:text-white transition text-sm">
              Integrations
            </Link>
            <Link href="/pricing" className="text-white/60 hover:text-white transition text-sm">
              Pricing
            </Link>
            <a href="https://github.com/devograph/devograph" className="text-white/60 hover:text-white transition text-sm flex items-center gap-1">
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <a
              href={githubLoginUrl}
              className="text-white/70 hover:text-white transition text-sm font-medium flex items-center gap-1"
            >
              <Github className="h-4 w-4" />
              Sign In
            </a>
            <a
              href={googleLoginUrl}
              className="group relative bg-white text-black px-5 py-2.5 rounded-full transition text-sm font-semibold flex items-center gap-2 hover:bg-white/90"
            >
              <GoogleIcon />
              Get Started
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-24 px-6 relative">
        <div className="max-w-7xl mx-auto relative">
          <div className="max-w-4xl mx-auto text-center">
            {/* Open Source Badge */}
            <a
              href="https://github.com/devograph/devograph"
              className="group inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm mb-6 hover:border-emerald-500/50 transition-all hover:scale-105"
            >
              <Github className="h-4 w-4" />
              <span>Open Source</span>
              <span className="text-white/40">·</span>
              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
              <span>5,000+ Stars</span>
              <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </a>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-8 leading-[1.1] tracking-tight">
              The open-source
              <br />
              <span className="relative">
                <span className="bg-gradient-to-r from-primary-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
                  operating system
                </span>
              </span>
              <br />
              for engineering organizations
            </h1>

            <p className="text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
              Understand your team. Optimize operations. Build talent.
              <br />
              All in one platform. All transparent.
            </p>

            <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
              <a
                href={googleLoginUrl}
                className="group relative overflow-hidden bg-white text-black px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(255,255,255,0.3)] flex items-center justify-center gap-3"
              >
                <GoogleIcon />
                Continue with Google
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href={githubLoginUrl}
                className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
              >
                <Github className="h-5 w-5" />
                Continue with GitHub
              </a>
            </div>

            <div className="flex items-center justify-center gap-8 text-sm text-white/40">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                No credit card required
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Self-host free
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                SOC 2 certified
              </span>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="mt-20 relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-primary-500/20 via-purple-500/20 to-emerald-500/20 rounded-3xl blur-2xl opacity-50" />
            <div className="relative bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-1.5 shadow-2xl">
              <div className="bg-[#0d0d12] rounded-xl overflow-hidden">
                <DashboardPreview />
              </div>
            </div>
            {/* Floating badges */}
            <div className="absolute -left-4 top-1/4 bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 backdrop-blur-sm border border-emerald-500/20 rounded-xl px-4 py-3 animate-float">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-sm font-medium">3 commits synced</span>
              </div>
            </div>
            <div className="absolute -right-4 top-1/3 bg-gradient-to-r from-purple-500/20 to-purple-500/10 backdrop-blur-sm border border-purple-500/20 rounded-xl px-4 py-3 animate-float delay-500">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-400" />
                <span className="text-purple-400 text-sm font-medium">Skills analyzed</span>
              </div>
            </div>
            <div className="absolute -left-4 bottom-1/4 bg-gradient-to-r from-amber-500/20 to-amber-500/10 backdrop-blur-sm border border-amber-500/20 rounded-xl px-4 py-3 animate-float delay-700">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-amber-400" />
                <span className="text-amber-400 text-sm font-medium">12 emails synced</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Four Pillars Section */}
      <section id="pillars" className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              One platform. Four pillars. Complete visibility.
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Everything you need to run a world-class engineering organization.
              Start with one pillar, expand to all four.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* UNDERSTAND Pillar */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-blue-500/30 transition-all h-full">
                <div className="p-4 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg shadow-blue-500/25 w-fit mb-6">
                  <Activity className="h-8 w-8 text-white" />
                </div>
                <div className="text-blue-400 text-sm font-semibold tracking-wider mb-2">UNDERSTAND</div>
                <h3 className="text-2xl font-bold text-white mb-3">Intelligence</h3>
                <p className="text-white/50 mb-6">
                  Know your engineering organization. See team health, predict risks, and make data-driven decisions.
                </p>
                <div className="border-t border-white/10 pt-6 space-y-3">
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-blue-400" />
                    Developer profiles & skills
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-blue-400" />
                    Team health analytics
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-blue-400" />
                    Attrition & burnout prediction
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-blue-400" />
                    Custom dashboards & reports
                  </div>
                </div>
                <Link href="#features" className="inline-flex items-center gap-2 text-blue-400 mt-6 text-sm font-medium group-hover:gap-3 transition-all">
                  Explore Intelligence <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* OPTIMIZE Pillar */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-purple-500/30 transition-all h-full">
                <div className="p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg shadow-purple-500/25 w-fit mb-6">
                  <Zap className="h-8 w-8 text-white" />
                </div>
                <div className="text-purple-400 text-sm font-semibold tracking-wider mb-2">OPTIMIZE</div>
                <h3 className="text-2xl font-bold text-white mb-3">Operations</h3>
                <p className="text-white/50 mb-6">
                  Run engineering efficiently. Better planning, smarter assignments, less overhead.
                </p>
                <div className="border-t border-white/10 pt-6 space-y-3">
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-purple-400" />
                    AI-powered task matching
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-purple-400" />
                    Sprint planning & velocity
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-purple-400" />
                    On-call management
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-purple-400" />
                    Ticketing & escalations
                  </div>
                </div>
                <Link href="#features" className="inline-flex items-center gap-2 text-purple-400 mt-6 text-sm font-medium group-hover:gap-3 transition-all">
                  Explore Operations <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* BUILD Pillar */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-emerald-500/30 transition-all h-full">
                <div className="p-4 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl shadow-lg shadow-emerald-500/25 w-fit mb-6">
                  <Rocket className="h-8 w-8 text-white" />
                </div>
                <div className="text-emerald-400 text-sm font-semibold tracking-wider mb-2">BUILD</div>
                <h3 className="text-2xl font-bold text-white mb-3">Talent</h3>
                <p className="text-white/50 mb-6">
                  Hire and grow the best engineers. Better assessments, personalized development, retained talent.
                </p>
                <div className="border-t border-white/10 pt-6 space-y-3">
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    AI technical assessments
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Job description generator
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Learning paths & skill gaps
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Career growth tracking
                  </div>
                </div>
                <Link href="#features" className="inline-flex items-center gap-2 text-emerald-400 mt-6 text-sm font-medium group-hover:gap-3 transition-all">
                  Explore Talent <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* CONNECT Pillar - CRM */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-amber-500/30 transition-all h-full">
                <div className="p-4 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl shadow-lg shadow-amber-500/25 w-fit mb-6">
                  <UserPlus className="h-8 w-8 text-white" />
                </div>
                <div className="text-amber-400 text-sm font-semibold tracking-wider mb-2">CONNECT</div>
                <h3 className="text-2xl font-bold text-white mb-3">Relationships</h3>
                <p className="text-white/50 mb-6">
                  Manage all your business relationships. CRM, email sync, calendar integration, AI enrichment.
                </p>
                <div className="border-t border-white/10 pt-6 space-y-3">
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-amber-400" />
                    Gmail & Calendar sync
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-amber-400" />
                    Contact management
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-amber-400" />
                    AI contact enrichment
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-amber-400" />
                    Sales pipeline tracking
                  </div>
                </div>
                <Link href="/crm" className="inline-flex items-center gap-2 text-amber-400 mt-6 text-sm font-medium group-hover:gap-3 transition-all">
                  Explore CRM <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Open Source Section */}
      <section className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm mb-6">
              <Github className="h-4 w-4" />
              Open Source
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              Why we&apos;re open source
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Developer analytics tools have a surveillance problem. We solved it by making everything transparent.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {/* Transparent */}
            <div className="group relative">
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all h-full text-center">
                <div className="p-4 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-2xl w-fit mx-auto mb-6">
                  <Shield className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Transparent</h3>
                <p className="text-white/50 text-sm">
                  Every algorithm is open-source. Audit the code anytime. Your developers will trust metrics they can verify.
                </p>
              </div>
            </div>

            {/* No Vendor Lock-in */}
            <div className="group relative">
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all h-full text-center">
                <div className="p-4 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl w-fit mx-auto mb-6">
                  <RefreshCw className="h-8 w-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">No Vendor Lock-in</h3>
                <p className="text-white/50 text-sm">
                  Export everything. Self-host anytime. No hostage situations. We earn your business by being better, not by trapping you.
                </p>
              </div>
            </div>

            {/* Community Driven */}
            <div className="group relative">
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all h-full text-center">
                <div className="p-4 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-2xl w-fit mx-auto mb-6">
                  <Users className="h-8 w-8 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Community Driven</h3>
                <p className="text-white/50 text-sm">
                  500+ contributors. Weekly releases. Features you actually need. Join the community shaping the future of engineering intelligence.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <a
              href="https://github.com/devograph/devograph"
              className="group inline-flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-semibold transition-all hover:scale-105"
            >
              <Github className="h-5 w-5" />
              View on GitHub
              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            </a>
            <Link
              href="/about"
              className="group inline-flex items-center gap-2 bg-white/5 text-white px-6 py-3 rounded-full font-semibold transition-all border border-white/10 hover:border-white/20"
            >
              Read Our Story
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section - Bento Grid */}
      <section id="features" className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500/10 border border-primary-500/20 rounded-full text-primary-400 text-sm mb-6">
              <Cpu className="h-4 w-4" />
              Feature Deep Dive
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              Everything you need to run engineering
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Explore the full capabilities across all three pillars of the Engineering OS.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-12 gap-4 md:gap-6">
            {/* AI Developer Profiles - Large card */}
            <div className="col-span-12 md:col-span-7 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent border border-white/10 p-8 hover:border-blue-500/30 transition-all duration-500">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg shadow-blue-500/25">
                      <Users className="h-6 w-6 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded-full border border-blue-500/20">
                      AI-POWERED
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">AI Developer Profiles</h3>
                  <p className="text-white/50 mb-6 max-w-md">
                    Automatic skill extraction from commits and PRs. Know your team&apos;s expertise in TypeScript, React, Python, and 50+ technologies.
                  </p>
                  {/* Skill visualization */}
                  <div className="flex flex-wrap gap-2">
                    {["TypeScript", "React", "Python", "Node.js", "Go", "Rust"].map((skill, i) => (
                      <div
                        key={skill}
                        className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white/70 text-sm hover:bg-white/10 hover:border-white/20 transition-all cursor-default"
                        style={{ animationDelay: `${i * 100}ms` }}
                      >
                        {skill}
                      </div>
                    ))}
                    <div className="px-3 py-1.5 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/20 rounded-lg text-blue-400 text-sm">
                      +44 more
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Epic Tracking - Medium card */}
            <div className="col-span-12 md:col-span-5 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent border border-white/10 p-8 hover:border-purple-500/30 transition-all duration-500">
                <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl group-hover:bg-purple-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg shadow-purple-500/25">
                      <Layers className="h-6 w-6 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20">
                      NEW
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Epic & Initiative Tracking</h3>
                  <p className="text-white/50 mb-6">
                    Create epics spanning multiple sprints. Link tasks from Jira, Linear, or GitHub Issues.
                  </p>
                  {/* Mini progress visualization */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-purple-500" />
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full w-3/4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" />
                      </div>
                      <span className="text-white/40 text-sm">75%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-pink-500" />
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full w-1/2 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full" />
                      </div>
                      <span className="text-white/40 text-sm">50%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Smart Sprint Planning */}
            <div className="col-span-12 md:col-span-4 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent border border-white/10 p-8 hover:border-orange-500/30 transition-all duration-500">
                <div className="absolute bottom-0 right-0 w-40 h-40 bg-orange-500/20 rounded-full blur-3xl group-hover:bg-orange-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="p-3 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl shadow-lg shadow-orange-500/25 w-fit mb-4">
                    <Layout className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Smart Sprint Planning</h3>
                  <p className="text-white/50 text-sm">
                    Visual kanban with AI-powered capacity planning and task suggestions.
                  </p>
                </div>
              </div>
            </div>

            {/* Intelligent Task Matching */}
            <div className="col-span-12 md:col-span-4 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-white/10 p-8 hover:border-emerald-500/30 transition-all duration-500">
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl group-hover:bg-emerald-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl shadow-lg shadow-emerald-500/25">
                      <Target className="h-6 w-6 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded-full border border-blue-500/20">
                      AI-POWERED
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Intelligent Task Matching</h3>
                  <p className="text-white/50 text-sm">
                    AI matches tasks to developers based on skills and workload.
                  </p>
                </div>
              </div>
            </div>

            {/* Learning Paths */}
            <div className="col-span-12 md:col-span-4 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500/10 via-red-500/5 to-transparent border border-white/10 p-8 hover:border-rose-500/30 transition-all duration-500">
                <div className="absolute top-0 left-0 w-40 h-40 bg-rose-500/20 rounded-full blur-3xl group-hover:bg-rose-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="p-3 bg-gradient-to-br from-rose-500 to-red-500 rounded-2xl shadow-lg shadow-rose-500/25 w-fit mb-4">
                    <GraduationCap className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Learning Paths</h3>
                  <p className="text-white/50 text-sm">
                    Personalized growth with gamified progress and achievement badges.
                  </p>
                </div>
              </div>
            </div>

            {/* On-Call Scheduling - Medium card */}
            <div className="col-span-12 md:col-span-6 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent border border-white/10 p-8 hover:border-green-500/30 transition-all duration-500">
                <div className="absolute top-0 right-0 w-48 h-48 bg-green-500/20 rounded-full blur-3xl group-hover:bg-green-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl shadow-lg shadow-green-500/25">
                      <Phone className="h-6 w-6 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20">
                      NEW
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">On-Call Scheduling</h3>
                  <p className="text-white/50 mb-6">
                    Flexible on-call rotations with Google Calendar sync. Self-service swaps and real-time notifications.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      Custom schedules per team
                    </div>
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      Google Calendar sync
                    </div>
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      Self-service shift swaps
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Reviews - Medium card */}
            <div className="col-span-12 md:col-span-6 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-500/10 via-teal-500/5 to-transparent border border-white/10 p-8 hover:border-cyan-500/30 transition-all duration-500">
                <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/20 rounded-full blur-3xl group-hover:bg-cyan-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-cyan-500 to-teal-500 rounded-2xl shadow-lg shadow-cyan-500/25">
                      <ClipboardCheck className="h-6 w-6 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20">
                      NEW
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">360° Performance Reviews</h3>
                  <p className="text-white/50 mb-6">
                    SMART goals with auto-linked GitHub contributions. Anonymous peer feedback with COIN framework.
                  </p>
                  {/* Review features */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                      Auto-generated contribution summaries
                    </div>
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                      Anonymous 360° feedback
                    </div>
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                      SMART goal tracking with OKRs
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Review Summary - Small card */}
            <div className="col-span-12 md:col-span-6 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-transparent border border-white/10 p-8 hover:border-violet-500/30 transition-all duration-500">
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-violet-500/20 rounded-full blur-3xl group-hover:bg-violet-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-500 rounded-2xl shadow-lg shadow-violet-500/25">
                      <Sparkles className="h-6 w-6 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded-full border border-blue-500/20">
                      AI-POWERED
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">AI Review Intelligence</h3>
                  <p className="text-white/50 mb-4">
                    LLM-powered insights that synthesize your GitHub activity into compelling review narratives.
                  </p>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="text-white/60 text-sm italic">
                        &ldquo;Led 3 major feature implementations with 98% test coverage. Strong collaboration...&rdquo;
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CRM Inbox - Medium card */}
            <div className="col-span-12 md:col-span-6 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-white/10 p-8 hover:border-amber-500/30 transition-all duration-500">
                <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl group-hover:bg-amber-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl shadow-lg shadow-amber-500/25">
                      <Inbox className="h-6 w-6 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20">
                      NEW
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">CRM Inbox</h3>
                  <p className="text-white/50 mb-6">
                    Gmail sync with automatic contact linking. Reply to emails, track threads, and link to deals.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-amber-400" />
                      Auto-sync Gmail messages
                    </div>
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-amber-400" />
                      Link emails to contacts & deals
                    </div>
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-amber-400" />
                      Reply directly from CRM
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Management */}
            <div className="col-span-12 md:col-span-4 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500/10 via-rose-500/5 to-transparent border border-white/10 p-8 hover:border-pink-500/30 transition-all duration-500">
                <div className="absolute bottom-0 right-0 w-40 h-40 bg-pink-500/20 rounded-full blur-3xl group-hover:bg-pink-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl shadow-lg shadow-pink-500/25">
                      <Building2 className="h-6 w-6 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded-full border border-blue-500/20">
                      AI-POWERED
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Contact Management</h3>
                  <p className="text-white/50 text-sm">
                    Companies, people, and deals. AI extracts info from email signatures.
                  </p>
                </div>
              </div>
            </div>

            {/* Calendar Sync */}
            <div className="col-span-12 md:col-span-4 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent border border-white/10 p-8 hover:border-sky-500/30 transition-all duration-500">
                <div className="absolute top-0 left-0 w-40 h-40 bg-sky-500/20 rounded-full blur-3xl group-hover:bg-sky-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="p-3 bg-gradient-to-br from-sky-500 to-blue-500 rounded-2xl shadow-lg shadow-sky-500/25 w-fit mb-4">
                    <Calendar className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Calendar Sync</h3>
                  <p className="text-white/50 text-sm">
                    Google Calendar integration. Events link to contacts and deals automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Email Intelligence */}
            <div className="col-span-12 md:col-span-4 group">
              <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-lime-500/10 via-green-500/5 to-transparent border border-white/10 p-8 hover:border-lime-500/30 transition-all duration-500">
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-lime-500/20 rounded-full blur-3xl group-hover:bg-lime-500/30 transition-all duration-500" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-lime-500 to-green-500 rounded-2xl shadow-lg shadow-lime-500/25">
                      <Mail className="h-6 w-6 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded-full border border-blue-500/20">
                      AI-POWERED
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Email Intelligence</h3>
                  <p className="text-white/50 text-sm">
                    AI extracts contacts, classifies leads, and enriches records from signatures.
                  </p>
                </div>
              </div>
            </div>

            {/* Team Analytics - Wide card */}
            <div className="col-span-12 group">
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-purple-500/10 border border-white/10 p-8 hover:border-indigo-500/30 transition-all duration-500">
                <div className="absolute top-0 left-1/4 w-96 h-48 bg-indigo-500/20 rounded-full blur-3xl group-hover:bg-indigo-500/30 transition-all duration-500" />
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
                  <div className="md:max-w-md">
                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-2xl shadow-lg shadow-indigo-500/25 w-fit mb-4">
                      <BarChart3 className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-3">Team Analytics</h3>
                    <p className="text-white/50">
                      Velocity tracking, contribution insights, and collaboration patterns. Real-time dashboards for engineering leaders.
                    </p>
                  </div>
                  {/* Mini chart visualization */}
                  <div className="flex items-end gap-2 h-24">
                    {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95].map((h, i) => (
                      <div
                        key={i}
                        className="w-6 md:w-8 bg-gradient-to-t from-indigo-500 to-violet-500 rounded-t-lg transition-all duration-300 hover:from-indigo-400 hover:to-violet-400"
                        style={{ height: `${h}%`, animationDelay: `${i * 50}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integration Section */}
      <section id="integrations" className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm mb-6">
              <RefreshCw className="h-4 w-4 animate-spin-slow" />
              Automated Sync
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              Seamless Integrations
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Connect once, sync forever. Your commits automatically update tasks, epics, and sprints.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <IntegrationCard
              icon={<Github className="h-8 w-8" />}
              title="GitHub"
              description="Auto-analyze commits, PRs, and code reviews. Build rich developer profiles."
              features={["Commit analysis", "PR tracking", "Code review insights", "Skill extraction"]}
              gradient="from-slate-500 to-slate-400"
            />
            <IntegrationCard
              icon={<GoogleIcon />}
              title="Google"
              description="Gmail and Calendar sync. Auto-link emails to contacts and sync events."
              features={["Gmail sync", "Calendar sync", "Contact enrichment", "Event tracking"]}
              gradient="from-red-500 to-amber-400"
            />
            <IntegrationCard
              icon={<JiraIcon large />}
              title="Jira"
              description="Two-way sync with Jira. Import issues, update status, link PRs to tickets."
              features={["Issue import", "Status sync", "Epic tracking", "Sprint mapping"]}
              gradient="from-blue-500 to-blue-400"
            />
            <IntegrationCard
              icon={<LinearIcon large />}
              title="Linear"
              description="Native Linear integration. Auto-close issues, sync projects, track cycles."
              features={["Auto-close issues", "Project sync", "Cycle mapping", "Priority sync"]}
              gradient="from-purple-500 to-violet-400"
            />
          </div>

          {/* Sync Flow */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-emerald-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10">
              <h3 className="text-xl font-semibold text-white mb-8 text-center">How Auto-Sync Works</h3>
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
                <SyncStep icon={<GitPullRequest />} label="Push Code" desc="Commit or merge PR" />
                <SyncArrow />
                <SyncStep icon={<Bot />} label="AI Analyzes" desc="Skills extracted" />
                <SyncArrow />
                <SyncStep icon={<RefreshCw />} label="Auto-Sync" desc="Tools updated" />
                <SyncArrow />
                <SyncStep icon={<CheckCircle2 />} label="Done!" desc="Tasks complete" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              Get Started in 2 Minutes
            </h2>
            <p className="text-white/50 text-lg">No complex setup. Just connect and go.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { num: "1", icon: <Github />, title: "Connect GitHub", desc: "One-click OAuth" },
              { num: "2", icon: <RefreshCw />, title: "Link Jira/Linear", desc: "Optional integrations" },
              { num: "3", icon: <Bot />, title: "Auto-Profile", desc: "AI builds profiles" },
              { num: "4", icon: <Rocket />, title: "Start Planning", desc: "Create sprints" },
            ].map((step, i) => (
              <div key={i} className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500" />
                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-6 text-center hover:border-white/20 transition-all group-hover:translate-y-[-4px] duration-300">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary-500 to-purple-500 rounded-2xl" />
                    <div className="absolute inset-0 flex items-center justify-center text-white">
                      {step.icon}
                    </div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-white text-black rounded-full flex items-center justify-center text-xs font-bold">
                      {step.num}
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1">{step.title}</h3>
                  <p className="text-white/50 text-sm">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/20 via-purple-500/20 to-emerald-500/20 rounded-3xl blur-2xl" />
            <div className="relative bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-sm rounded-3xl p-12 border border-white/10">
              <div className="grid md:grid-cols-4 gap-8 text-center">
                {[
                  { num: "50%", label: "Faster Planning", icon: <Zap /> },
                  { num: "2x", label: "Better Matching", icon: <Target /> },
                  { num: "100%", label: "Sync Accuracy", icon: <RefreshCw /> },
                  { num: "30%", label: "Velocity Boost", icon: <TrendingUp /> },
                ].map((stat, i) => (
                  <div key={i} className="group">
                    <div className="flex justify-center mb-3 text-primary-400 group-hover:scale-110 transition-transform">
                      {stat.icon}
                    </div>
                    <div className="text-5xl font-bold text-white mb-2 bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                      {stat.num}
                    </div>
                    <div className="text-white/50">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              Loved by Engineering Teams
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { quote: "Finally, a tool that understands developers. The GitHub integration is seamless and skill profiles are surprisingly accurate.", author: "Sarah Chen", role: "Engineering Manager", company: "TechStartup" },
              { quote: "The Jira auto-sync alone saved us hours every week. Now our sprints actually reflect what's happening in code.", author: "Marcus Rodriguez", role: "Tech Lead", company: "CloudScale" },
              { quote: "Sprint planning went from 2-hour meetings to 30 minutes. The AI task suggestions are spot-on.", author: "Emily Zhang", role: "VP Engineering", company: "DataFlow" },
            ].map((t, i) => (
              <div key={i} className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500" />
                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-6 hover:border-white/20 transition-all">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    ))}
                  </div>
                  <p className="text-white/70 mb-6 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {t.author.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <div className="text-white font-medium">{t.author}</div>
                      <div className="text-white/40 text-sm">{t.role} at {t.company}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/30 via-purple-500/30 to-emerald-500/30 rounded-3xl blur-2xl" />
            <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-3xl p-12 border border-white/10 text-center overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />

              <div className="relative">
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
                  Ready to run your Engineering OS?
                </h2>
                <p className="text-white/50 text-lg mb-10 max-w-2xl mx-auto">
                  Understand your team. Optimize operations. Build talent.
                </p>

                <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
                  <a
                    href={googleLoginUrl}
                    className="group inline-flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                  >
                    <GoogleIcon />
                    Continue with Google
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </a>
                  <a
                    href={githubLoginUrl}
                    className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
                  >
                    <Github className="h-5 w-5" />
                    Continue with GitHub
                  </a>
                </div>

                <p className="text-white/40 text-sm">
                  No credit card required · 14-day free trial
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-5 gap-8 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl">
                  <GitBranch className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">Devograph</span>
              </div>
              <p className="text-white/40 text-sm mb-4">
                The open-source operating system for engineering organizations.
              </p>
              <div className="flex items-center gap-3">
                <a href="https://github.com/devograph/devograph" className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition">
                  <Github className="h-4 w-4 text-white/60" />
                </a>
                <a href="#" className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition">
                  <svg className="h-4 w-4 text-white/60" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
                <a href="#" className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition">
                  <svg className="h-4 w-4 text-white/60" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.037c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/>
                  </svg>
                </a>
                <a href="#" className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition">
                  <svg className="h-4 w-4 text-white/60" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-white/40 text-sm">
                <li><Link href="#pillars" className="hover:text-white transition">Platform</Link></li>
                <li><Link href="#features" className="hover:text-white transition">Features</Link></li>
                <li><Link href="#integrations" className="hover:text-white transition">Integrations</Link></li>
                <li><Link href="/pricing" className="hover:text-white transition">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-white/40 text-sm">
                <li><Link href="/docs" className="hover:text-white transition">Documentation</Link></li>
                <li><a href="https://github.com/devograph/devograph" className="hover:text-white transition">GitHub</a></li>
                <li><Link href="#" className="hover:text-white transition">Changelog</Link></li>
                <li><Link href="#" className="hover:text-white transition">Community</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-white/40 text-sm">
                <li><Link href="#" className="hover:text-white transition">About</Link></li>
                <li><Link href="#" className="hover:text-white transition">Blog</Link></li>
                <li><Link href="#" className="hover:text-white transition">Careers</Link></li>
                <li><Link href="#" className="hover:text-white transition">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-white/40 text-sm">&copy; 2025 Devograph. All rights reserved.</p>
            <div className="flex items-center gap-6 text-white/40 text-sm">
              <Link href="#" className="hover:text-white transition">Privacy Policy</Link>
              <Link href="#" className="hover:text-white transition">Terms of Service</Link>
              <Link href="#" className="hover:text-white transition">Security</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Custom Styles */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        .animate-gradient {
          animation: gradient 3s ease infinite;
        }
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        .delay-500 {
          animation-delay: 500ms;
        }
        .delay-700 {
          animation-delay: 700ms;
        }
        .delay-1000 {
          animation-delay: 1000ms;
        }
      `}</style>
    </main>
  );
}

// Components
function JiraIcon({ large }: { large?: boolean }) {
  const size = large ? "h-8 w-8" : "h-5 w-5";
  return (
    <svg className={`${size} text-blue-400`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23 .262h-11.59a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.749V1.262A1.001 1.001 0 0 0 23 .262z" />
    </svg>
  );
}

function LinearIcon({ large }: { large?: boolean }) {
  const size = large ? "h-8 w-8" : "h-5 w-5";
  return (
    <svg className={`${size} text-purple-400`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.654 10.6a.463.463 0 0 1-.127-.636l3.197-4.686a.464.464 0 0 1 .636-.127l14.986 10.228a.463.463 0 0 1 .127.636l-3.197 4.686a.464.464 0 0 1-.636.127L2.654 10.6zm.636 2.8a.463.463 0 0 0-.127.636l3.197 4.686a.464.464 0 0 0 .636.127l8.486-5.794-3.706-2.528-8.486 2.873zm16.056-3.328L10.86 4.278 7.154 6.806l8.486 5.794 3.706-2.528z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function DashboardPreview() {
  return (
    <div className="bg-[#0d0d12] p-6">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <GitBranch className="h-4 w-4 text-white" />
            </div>
            <span className="text-white font-semibold">Devograph</span>
          </div>
          <div className="flex gap-2">
            <div className="px-3 py-1 bg-white/10 rounded-lg text-white text-xs">Dashboard</div>
            <div className="px-3 py-1 text-white/40 text-xs">Sprints</div>
            <div className="px-3 py-1 text-white/40 text-xs">Epics</div>
          </div>
        </div>
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">JD</div>
            <div>
              <div className="text-white text-sm font-medium">Jane Developer</div>
              <div className="text-white/40 text-xs">Senior Engineer</div>
            </div>
          </div>
          <div className="space-y-2">
            {[{ l: "TypeScript", v: 95 }, { l: "React", v: 90 }, { l: "Node.js", v: 80 }].map(s => (
              <div key={s.l}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/60">{s.l}</span>
                  <span className="text-white/40">{s.v}%</span>
                </div>
                <div className="h-1 bg-white/10 rounded-full"><div className="h-full bg-gradient-to-r from-primary-500 to-cyan-500 rounded-full" style={{ width: `${s.v}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white text-sm font-medium">Sprint 24</span>
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">Active</span>
          </div>
          <div className="space-y-2">
            {[{ s: "done", t: "API Integration" }, { s: "progress", t: "Dashboard UI" }, { s: "todo", t: "Testing" }].map((task, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${task.s === "done" ? "bg-emerald-500" : task.s === "progress" ? "bg-blue-500" : "bg-white/20"}`} />
                <span className={`text-xs ${task.s === "done" ? "text-white/40 line-through" : "text-white/70"}`}>{task.t}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-white/5">
            <div className="flex justify-between text-xs text-white/40 mb-1"><span>Progress</span><span>67%</span></div>
            <div className="h-1.5 bg-white/10 rounded-full"><div className="h-full w-2/3 bg-gradient-to-r from-primary-500 to-emerald-500 rounded-full" /></div>
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <div className="text-white text-sm font-medium mb-3">Recent Syncs</div>
          <div className="space-y-2">
            {[{ p: "GitHub", a: "3 commits synced", t: "2m ago" }, { p: "Gmail", a: "12 emails synced", t: "3m ago" }, { p: "Jira", a: "PROJ-123 updated", t: "5m ago" }, { p: "Calendar", a: "2 events added", t: "8m ago" }].map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <span className="text-xs text-white/40">{s.p}:</span>
                  <span className="text-xs text-white/70">{s.a}</span>
                </div>
                <span className="text-xs text-white/30">{s.t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({ icon, title, description, features, gradient }: { icon: React.ReactNode; title: string; description: string; features: string[]; gradient: string }) {
  return (
    <div className="group relative">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-3xl opacity-0 group-hover:opacity-20 blur-xl transition-all duration-500`} />
      <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all h-full">
        <div className={`w-16 h-16 bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform shadow-lg`}>
          {icon}
        </div>
        <h3 className="text-2xl font-bold text-white mb-3">{title}</h3>
        <p className="text-white/50 mb-6">{description}</p>
        <ul className="space-y-2">
          {features.map(f => (
            <li key={f} className="flex items-center gap-2 text-white/60 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SyncStep({ icon, label, desc }: { icon: React.ReactNode; label: string; desc: string }) {
  return (
    <div className="flex flex-col items-center text-center group">
      <div className="w-14 h-14 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-xl flex items-center justify-center text-primary-400 mb-3 group-hover:scale-110 transition-transform border border-primary-500/20">
        {icon}
      </div>
      <div className="text-white font-medium">{label}</div>
      <div className="text-white/40 text-sm">{desc}</div>
    </div>
  );
}

function SyncArrow() {
  return <div className="hidden md:block text-white/20"><ChevronRight className="h-6 w-6" /></div>;
}

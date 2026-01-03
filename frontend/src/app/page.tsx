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
  Play,
  Github,
  GraduationCap,
  Code2,
  Cpu,
  Activity,
  MousePointerClick,
  ClipboardCheck,
  Phone,
  Calendar,
  FileText,
  Ticket,
  Terminal,
  Wand2,
  Clock,
  Bell,
} from "lucide-react";
import Link from "next/link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const loginUrl = `${API_BASE_URL}/auth/github/login`;

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
            <Link href="#features" className="text-white/60 hover:text-white transition text-sm">
              Features
            </Link>
            <Link href="#integrations" className="text-white/60 hover:text-white transition text-sm">
              Integrations
            </Link>
            <Link href="#how-it-works" className="text-white/60 hover:text-white transition text-sm">
              How it Works
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <a
              href={loginUrl}
              className="text-white/70 hover:text-white transition text-sm font-medium"
            >
              Sign In
            </a>
            <a
              href={loginUrl}
              className="group relative bg-white text-black px-5 py-2.5 rounded-full transition text-sm font-semibold flex items-center gap-2 hover:bg-white/90"
            >
              <Github className="h-4 w-4" />
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
            {/* Product Hunt Badge */}
            <a
              href="#"
              className="group inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 rounded-full text-orange-400 text-sm mb-6 hover:border-orange-500/50 transition-all hover:scale-105"
            >
              <Rocket className="h-4 w-4 animate-bounce" />
              <span>We&apos;re live on Product Hunt!</span>
              <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </a>

            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white/60 text-sm mb-8">
              <Sparkles className="h-4 w-4 text-primary-400" />
              The Ultimate Developer Productivity Platform
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-8 leading-[1.1] tracking-tight">
              One Platform for
              <br />
              <span className="relative">
                <span className="bg-gradient-to-r from-primary-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
                  Everything Dev Teams Need
                </span>
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                  <path d="M2 10C50 4 100 4 150 6C200 8 250 4 298 10" stroke="url(#gradient)" strokeWidth="3" strokeLinecap="round"/>
                  <defs>
                    <linearGradient id="gradient" x1="0" y1="0" x2="300" y2="0">
                      <stop stopColor="#22d3ee" />
                      <stop offset="0.5" stopColor="#a855f7" />
                      <stop offset="1" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
            </h1>

            <p className="text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
              Sprints, On-Call, Docs, Ticketing, AI Agents — all in one place.
              Connect GitHub, Jira, Linear, and Google Calendar for seamless team productivity.
            </p>

            {/* Integration logos */}
            <div className="flex items-center justify-center gap-3 mb-10 flex-wrap">
              <IntegrationPill name="GitHub" icon={<Github className="h-5 w-5" />} />
              <div className="w-6 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent hidden sm:block" />
              <IntegrationPill name="Jira" icon={<JiraIcon />} color="text-blue-400" />
              <div className="w-6 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent hidden sm:block" />
              <IntegrationPill name="Linear" icon={<LinearIcon />} color="text-purple-400" />
              <div className="w-6 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent hidden sm:block" />
              <IntegrationPill name="Google Calendar" icon={<Calendar className="h-5 w-5" />} color="text-green-400" />
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
              <a
                href={loginUrl}
                className="group relative overflow-hidden bg-gradient-to-r from-primary-600 to-primary-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(34,211,238,0.3)] flex items-center justify-center gap-2"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                <Github className="h-5 w-5" />
                Connect GitHub — It&apos;s Free
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </a>
              <Link
                href="#demo"
                className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-2"
              >
                <Play className="h-5 w-5 text-primary-400" />
                Watch Demo
              </Link>
            </div>

            <div className="flex items-center justify-center gap-8 text-sm text-white/40">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                No credit card
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                2 minute setup
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Free forever plan
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
          </div>
        </div>
      </section>

      {/* Features Section - Bento Grid */}
      <section id="features" className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500/10 border border-primary-500/20 rounded-full text-primary-400 text-sm mb-6">
              <Cpu className="h-4 w-4" />
              Complete Productivity Suite
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              Everything Your Team Needs
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Sprint planning, on-call scheduling, documentation, ticketing, and AI agents — all unified in one platform.
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

      {/* Coming Soon Section */}
      <section className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-sm mb-6">
              <Rocket className="h-4 w-4" />
              Coming Soon
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              The Roadmap
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              We&apos;re building the complete developer productivity platform. Here&apos;s what&apos;s next.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Vibe-Kanban */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-pink-500/30 transition-all h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-gradient-to-br from-pink-500 to-purple-500 rounded-2xl shadow-lg shadow-pink-500/25">
                    <Terminal className="h-6 w-6 text-white" />
                  </div>
                  <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs font-semibold rounded-full border border-amber-500/20">
                    Q1 2025
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Vibe-Kanban</h3>
                <p className="text-white/50 mb-4">
                  Execute any task in the UI via AI coding agents. Open pull requests automatically with on-demand dev servers.
                </p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-white/60 text-sm">
                    <Bot className="h-4 w-4 text-pink-400" />
                    AI-powered task execution
                  </li>
                  <li className="flex items-center gap-2 text-white/60 text-sm">
                    <GitPullRequest className="h-4 w-4 text-pink-400" />
                    Auto-generate PRs
                  </li>
                  <li className="flex items-center gap-2 text-white/60 text-sm">
                    <Code2 className="h-4 w-4 text-pink-400" />
                    Custom Docker environments
                  </li>
                </ul>
              </div>
            </div>

            {/* Smart Docs */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-blue-500/30 transition-all h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg shadow-blue-500/25">
                    <FileText className="h-6 w-6 text-white" />
                  </div>
                  <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs font-semibold rounded-full border border-amber-500/20">
                    Q2 2025
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Smart Docs</h3>
                <p className="text-white/50 mb-4">
                  A Notion alternative built for developers. Auto-generate and sync documentation from your codebase.
                </p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-white/60 text-sm">
                    <Wand2 className="h-4 w-4 text-blue-400" />
                    AI documentation generation
                  </li>
                  <li className="flex items-center gap-2 text-white/60 text-sm">
                    <RefreshCw className="h-4 w-4 text-blue-400" />
                    Auto-sync from repos
                  </li>
                  <li className="flex items-center gap-2 text-white/60 text-sm">
                    <Layers className="h-4 w-4 text-blue-400" />
                    Custom templates
                  </li>
                </ul>
              </div>
            </div>

            {/* Ticketing Service */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-amber-500/20 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-orange-500/30 transition-all h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl shadow-lg shadow-orange-500/25">
                    <Ticket className="h-6 w-6 text-white" />
                  </div>
                  <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs font-semibold rounded-full border border-amber-500/20">
                    Q2 2025
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Ticketing Service</h3>
                <p className="text-white/50 mb-4">
                  Public customizable forms for bug reports and feature requests. Auto-create issues in GitHub, Jira, or Linear.
                </p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-white/60 text-sm">
                    <Layout className="h-4 w-4 text-orange-400" />
                    Custom public forms
                  </li>
                  <li className="flex items-center gap-2 text-white/60 text-sm">
                    <RefreshCw className="h-4 w-4 text-orange-400" />
                    Multi-platform sync
                  </li>
                  <li className="flex items-center gap-2 text-white/60 text-sm">
                    <BarChart3 className="h-4 w-4 text-orange-400" />
                    TAT analytics
                  </li>
                </ul>
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

          <div className="grid lg:grid-cols-3 gap-6">
            <IntegrationCard
              icon={<Github className="h-8 w-8" />}
              title="GitHub"
              description="Auto-analyze commits, PRs, and code reviews. Build rich developer profiles."
              features={["Commit analysis", "PR tracking", "Code review insights", "Skill extraction"]}
              gradient="from-slate-500 to-slate-400"
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
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-full text-white/80 text-sm mb-6">
                  <Star className="h-4 w-4 text-yellow-500" />
                  Free for teams up to 5 developers
                </div>

                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
                  Ready to Transform Your Team&apos;s Productivity?
                </h2>
                <p className="text-white/50 text-lg mb-10 max-w-2xl mx-auto">
                  Join hundreds of engineering teams using Devograph for sprints, on-call, and more.
                </p>

                <a
                  href={loginUrl}
                  className="group inline-flex items-center justify-center gap-2 bg-white text-black px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                >
                  <Github className="h-5 w-5" />
                  Start Free with GitHub
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </a>

                <p className="text-white/40 text-sm mt-6">
                  No credit card required. Setup takes less than 2 minutes.
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
                The ultimate developer productivity platform. Sprints, on-call, docs, ticketing, and AI agents — all in one place.
              </p>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/5 border border-white/10 rounded-lg">
                  <Github className="h-4 w-4 text-white/60" />
                </div>
                <div className="p-2 bg-white/5 border border-white/10 rounded-lg">
                  <JiraIcon small />
                </div>
                <div className="p-2 bg-white/5 border border-white/10 rounded-lg">
                  <LinearIcon small />
                </div>
                <div className="p-2 bg-white/5 border border-white/10 rounded-lg">
                  <Calendar className="h-4 w-4 text-white/60" />
                </div>
              </div>
            </div>
            {[
              { title: "Product", links: ["Features", "Integrations", "Pricing", "Changelog"] },
              { title: "Company", links: ["About", "Blog", "Careers", "Contact"] },
              { title: "Legal", links: ["Privacy Policy", "Terms of Service", "Security"] },
            ].map((col, i) => (
              <div key={i}>
                <h4 className="text-white font-semibold mb-4">{col.title}</h4>
                <ul className="space-y-2 text-white/40 text-sm">
                  {col.links.map(link => (
                    <li key={link}><Link href="#" className="hover:text-white transition">{link}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-white/40 text-sm">&copy; 2025 Devograph. All rights reserved.</p>
            <div className="flex items-center gap-4 text-white/40">
              <a href="#" className="hover:text-white transition"><Shield className="h-5 w-5" /></a>
              <a href="https://github.com" className="hover:text-white transition"><Github className="h-5 w-5" /></a>
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
        .delay-1000 {
          animation-delay: 1000ms;
        }
      `}</style>
    </main>
  );
}

// Components
function IntegrationPill({ name, icon, color = "text-white" }: { name: string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 hover:border-white/20 transition-all cursor-default">
      <span className={color}>{icon}</span>
      <span className="text-white/80 text-sm font-medium">{name}</span>
    </div>
  );
}

function JiraIcon({ large, small }: { large?: boolean; small?: boolean }) {
  const size = small ? "h-4 w-4" : large ? "h-8 w-8" : "h-5 w-5";
  return (
    <svg className={`${size} text-blue-400`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23 .262h-11.59a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.749V1.262A1.001 1.001 0 0 0 23 .262z" />
    </svg>
  );
}

function LinearIcon({ large, small }: { large?: boolean; small?: boolean }) {
  const size = small ? "h-4 w-4" : large ? "h-8 w-8" : "h-5 w-5";
  return (
    <svg className={`${size} text-purple-400`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.654 10.6a.463.463 0 0 1-.127-.636l3.197-4.686a.464.464 0 0 1 .636-.127l14.986 10.228a.463.463 0 0 1 .127.636l-3.197 4.686a.464.464 0 0 1-.636.127L2.654 10.6zm.636 2.8a.463.463 0 0 0-.127.636l3.197 4.686a.464.464 0 0 0 .636.127l8.486-5.794-3.706-2.528-8.486 2.873zm16.056-3.328L10.86 4.278 7.154 6.806l8.486 5.794 3.706-2.528z" />
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
            {[{ p: "GitHub", a: "3 commits synced", t: "2m ago" }, { p: "Jira", a: "PROJ-123 updated", t: "5m ago" }, { p: "Linear", a: "Issue closed", t: "12m ago" }].map((s, i) => (
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

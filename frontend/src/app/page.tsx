"use client";

import {
  GitBranch,
  Users,
  TrendingUp,
  Target,
  Zap,
  BarChart3,
  Shield,
  Clock,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Layout,
  Calendar
} from "lucide-react";
import Link from "next/link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function Home() {
  const loginUrl = `${API_BASE_URL}/auth/github/login`;

  return (
    <main className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl">
              <GitBranch className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Devograph</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-slate-400 hover:text-white transition text-sm">
              Features
            </Link>
            <Link href="#how-it-works" className="text-slate-400 hover:text-white transition text-sm">
              How it Works
            </Link>
            <Link href="#pricing" className="text-slate-400 hover:text-white transition text-sm">
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <a
              href={loginUrl}
              className="text-slate-300 hover:text-white transition text-sm font-medium"
            >
              Sign In
            </a>
            <a
              href={loginUrl}
              className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg transition text-sm font-medium flex items-center gap-2"
            >
              <GitBranch className="h-4 w-4" />
              Connect GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500/10 border border-primary-500/20 rounded-full text-primary-400 text-sm mb-8">
              <Sparkles className="h-4 w-4" />
              AI-Powered Developer Intelligence Platform
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-8 leading-tight">
              Build Smarter Teams
              <br />
              <span className="bg-gradient-to-r from-primary-400 via-primary-500 to-emerald-400 bg-clip-text text-transparent">
                Ship Faster
              </span>
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
              Transform your GitHub activity into actionable insights. Automatic skill profiling,
              intelligent sprint planning, and data-driven team optimization.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a
                href={loginUrl}
                className="bg-primary-600 hover:bg-primary-500 text-white px-8 py-4 rounded-xl text-lg font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-primary-600/25"
              >
                Get Started Free
                <ArrowRight className="h-5 w-5" />
              </a>
              <Link
                href="#demo"
                className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-xl text-lg font-semibold transition border border-slate-700"
              >
                Watch Demo
              </Link>
            </div>
            <p className="text-slate-500 text-sm mt-6">
              No credit card required. Free for small teams.
            </p>
          </div>
        </div>
      </section>

      {/* Trusted By */}
      <section className="py-12 border-y border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-slate-500 text-sm mb-8">Trusted by engineering teams at</p>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-50">
            <div className="text-2xl font-bold text-slate-400">TechCorp</div>
            <div className="text-2xl font-bold text-slate-400">StartupXYZ</div>
            <div className="text-2xl font-bold text-slate-400">DevStudio</div>
            <div className="text-2xl font-bold text-slate-400">CloudBase</div>
            <div className="text-2xl font-bold text-slate-400">CodeLabs</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Everything you need to build great teams
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              From developer profiling to sprint planning, Devograph gives you the tools to understand and optimize your engineering organization.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="Developer Profiling"
              description="Automatic skill extraction from commits, PRs, and code reviews. Build rich developer profiles with language expertise, framework knowledge, and domain experience."
              gradient="from-blue-500 to-cyan-500"
            />
            <FeatureCard
              icon={<Target className="h-6 w-6" />}
              title="Smart Task Matching"
              description="AI-powered task-to-developer matching based on skills, experience, and current workload. Reduce context switching and optimize assignments."
              gradient="from-purple-500 to-pink-500"
            />
            <FeatureCard
              icon={<Layout className="h-6 w-6" />}
              title="Sprint Planning"
              description="Visual kanban boards with drag-and-drop, capacity planning, and burndown charts. Import tasks from GitHub Issues, Jira, or Linear."
              gradient="from-orange-500 to-amber-500"
            />
            <FeatureCard
              icon={<TrendingUp className="h-6 w-6" />}
              title="Career Pathways"
              description="Personalized learning recommendations based on goals and skill gaps. Track growth over time with detailed progression metrics."
              gradient="from-emerald-500 to-teal-500"
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6" />}
              title="Team Analytics"
              description="Velocity tracking, contribution patterns, and collaboration insights. Identify bottlenecks and optimize team performance."
              gradient="from-red-500 to-rose-500"
            />
            <FeatureCard
              icon={<Calendar className="h-6 w-6" />}
              title="Retrospectives"
              description="Built-in retrospective tools with action item tracking. Capture what went well, what to improve, and follow through on commitments."
              gradient="from-indigo-500 to-violet-500"
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Get started in minutes
            </h2>
            <p className="text-slate-400 text-lg">
              Connect your GitHub, and let Devograph do the rest.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              number="1"
              title="Connect GitHub"
              description="Authorize Devograph to access your GitHub organization. We only read public repository data and activity."
            />
            <StepCard
              number="2"
              title="Auto-Profile"
              description="We analyze commits, PRs, and reviews to build comprehensive skill profiles for every developer."
            />
            <StepCard
              number="3"
              title="Start Planning"
              description="Create sprints, assign tasks intelligently, and track progress with real-time analytics."
            />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-primary-600/20 to-emerald-600/20 rounded-3xl p-12 border border-primary-500/20">
            <div className="grid md:grid-cols-4 gap-8 text-center">
              <StatCard number="50%" label="Faster Task Assignments" icon={<Zap className="h-6 w-6" />} />
              <StatCard number="30%" label="Improved Velocity" icon={<TrendingUp className="h-6 w-6" />} />
              <StatCard number="2x" label="Better Skill Visibility" icon={<Users className="h-6 w-6" />} />
              <StatCard number="40%" label="Less Context Switching" icon={<Clock className="h-6 w-6" />} />
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 px-6 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-bold text-white mb-6">
                Why teams choose Devograph
              </h2>
              <p className="text-slate-400 text-lg mb-8">
                Traditional project management tools don&apos;t understand your developers.
                Devograph bridges the gap between code and planning.
              </p>
              <div className="space-y-4">
                <BenefitItem text="Automatic skill detection from actual code contributions" />
                <BenefitItem text="AI suggestions for optimal task assignments" />
                <BenefitItem text="Integration with GitHub, Jira, and Linear" />
                <BenefitItem text="Real-time velocity and burndown tracking" />
                <BenefitItem text="Privacy-first: we never store your source code" />
              </div>
            </div>
            <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold">
                    JD
                  </div>
                  <div>
                    <div className="text-white font-medium">Jane Developer</div>
                    <div className="text-slate-400 text-sm">Senior Engineer</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <SkillBar label="TypeScript" value={95} color="bg-blue-500" />
                  <SkillBar label="React" value={90} color="bg-cyan-500" />
                  <SkillBar label="Node.js" value={85} color="bg-green-500" />
                  <SkillBar label="PostgreSQL" value={75} color="bg-purple-500" />
                </div>
                <div className="text-slate-500 text-sm">
                  Skill profile auto-generated from 1,247 commits
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to build smarter teams?
          </h2>
          <p className="text-slate-400 text-lg mb-10">
            Join hundreds of engineering teams using Devograph to understand their developers better.
          </p>
          <a
            href={loginUrl}
            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-8 py-4 rounded-xl text-lg font-semibold transition shadow-lg shadow-primary-600/25"
          >
            <GitBranch className="h-5 w-5" />
            Connect GitHub & Get Started
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl">
                  <GitBranch className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">Devograph</span>
              </div>
              <p className="text-slate-500 text-sm">
                AI-powered developer intelligence platform for modern engineering teams.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><Link href="#features" className="hover:text-white transition">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-white transition">Pricing</Link></li>
                <li><Link href="#" className="hover:text-white transition">Integrations</Link></li>
                <li><Link href="#" className="hover:text-white transition">Changelog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><Link href="#" className="hover:text-white transition">About</Link></li>
                <li><Link href="#" className="hover:text-white transition">Blog</Link></li>
                <li><Link href="#" className="hover:text-white transition">Careers</Link></li>
                <li><Link href="#" className="hover:text-white transition">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><Link href="#" className="hover:text-white transition">Privacy Policy</Link></li>
                <li><Link href="#" className="hover:text-white transition">Terms of Service</Link></li>
                <li><Link href="#" className="hover:text-white transition">Security</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-slate-500 text-sm">
              &copy; 2025 Devograph. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-slate-500">
              <a href="#" className="hover:text-white transition">
                <Shield className="h-5 w-5" />
              </a>
              <a href="#" className="hover:text-white transition">
                <GitBranch className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  gradient,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}) {
  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition group">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition`}>
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6">
        {number}
      </div>
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <p className="text-slate-400">{description}</p>
    </div>
  );
}

function StatCard({
  number,
  label,
  icon
}: {
  number: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex justify-center mb-3 text-primary-400">
        {icon}
      </div>
      <div className="text-4xl font-bold text-white mb-2">{number}</div>
      <div className="text-slate-400">{label}</div>
    </div>
  );
}

function BenefitItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <CheckCircle2 className="h-6 w-6 text-emerald-500 flex-shrink-0 mt-0.5" />
      <span className="text-slate-300">{text}</span>
    </div>
  );
}

function SkillBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-500">{value}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

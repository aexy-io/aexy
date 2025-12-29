import { GitBranch, Users, TrendingUp, Target } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      {/* Header */}
      <header className="border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-8 w-8 text-primary-500" />
            <span className="text-2xl font-bold text-white">Gitraki</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-slate-300 hover:text-white transition"
            >
              Sign In
            </Link>
            <Link
              href="/api/v1/auth/github/login"
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition"
            >
              Connect GitHub
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold text-white mb-6">
          Developer Intelligence
          <br />
          <span className="text-primary-400">Powered by GitHub</span>
        </h1>
        <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-10">
          Build rich developer profiles, enable intelligent task allocation, and
          provide personalized career pathways - all from GitHub activity data.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/api/v1/auth/github/login"
            className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-lg text-lg font-medium transition"
          >
            Get Started Free
          </Link>
          <Link
            href="#features"
            className="border border-slate-600 text-slate-300 hover:bg-slate-800 px-8 py-3 rounded-lg text-lg font-medium transition"
          >
            Learn More
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          Core Capabilities
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <FeatureCard
            icon={<Users className="h-10 w-10 text-primary-400" />}
            title="Developer Profiling"
            description="Automatic skill extraction from commits, PRs, and code reviews. Build comprehensive developer profiles."
          />
          <FeatureCard
            icon={<Target className="h-10 w-10 text-primary-400" />}
            title="Task Matching"
            description="Intelligent task-developer matching based on skills, experience, and availability."
          />
          <FeatureCard
            icon={<TrendingUp className="h-10 w-10 text-primary-400" />}
            title="Career Pathing"
            description="Personalized learning paths and growth trajectories based on goals and current skills."
          />
          <FeatureCard
            icon={<GitBranch className="h-10 w-10 text-primary-400" />}
            title="Hiring Intelligence"
            description="Data-driven job requirements and skill gap analysis for better hiring decisions."
          />
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-slate-800/50 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <StatCard number="50%" label="Task-Skill Mismatch Reduction" />
            <StatCard number="30%" label="Faster Time-to-Fill Roles" />
            <StatCard number="25%" label="Improved Developer Retention" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-400">
          <p>&copy; 2024 Gitraki. GitHub-Based Developer Analytics Platform.</p>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-slate-400">{description}</p>
    </div>
  );
}

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <div className="text-4xl font-bold text-primary-400 mb-2">{number}</div>
      <div className="text-slate-300">{label}</div>
    </div>
  );
}

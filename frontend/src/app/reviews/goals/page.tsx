"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Target,
  Plus,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  Filter,
  Search,
  ArrowLeft,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";

export default function GoalsPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <AppHeader user={user} logout={logout} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/reviews" className="text-slate-400 hover:text-white transition flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Reviews
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-white">Goals</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">My Goals</h1>
            <p className="text-slate-400 mt-1">
              Track your SMART goals and key results
            </p>
          </div>
          <Link
            href="/reviews/goals/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            New Goal
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex bg-slate-800 rounded-lg p-1">
            {(["all", "active", "completed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition capitalize ${
                  filter === f
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search goals..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 text-sm"
            />
          </div>
        </div>

        {/* Empty State */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12">
          <div className="text-center max-w-lg mx-auto">
            <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6">
              <Target className="w-10 h-10 text-slate-500" />
            </div>
            <h3 className="text-xl font-medium text-white mb-3">No goals yet</h3>
            <p className="text-slate-400 text-sm mb-8">
              SMART goals help you track progress and automatically link your GitHub contributions.
              Set Specific, Measurable, Achievable, Relevant, and Time-bound objectives.
            </p>

            <Link
              href="/reviews/goals/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition font-medium"
            >
              <Plus className="h-4 w-4" />
              Create Your First Goal
            </Link>

            {/* Goal Types */}
            <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-cyan-400 text-sm font-medium mb-1">Performance</div>
                <p className="text-slate-400 text-xs">Delivery & quality targets</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-purple-400 text-sm font-medium mb-1">Skill Development</div>
                <p className="text-slate-400 text-xs">Learning new technologies</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-emerald-400 text-sm font-medium mb-1">Project</div>
                <p className="text-slate-400 text-xs">Feature & milestone goals</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-amber-400 text-sm font-medium mb-1">Leadership</div>
                <p className="text-slate-400 text-xs">Mentoring & team impact</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

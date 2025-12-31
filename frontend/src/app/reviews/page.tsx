"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ClipboardCheck,
  Target,
  Users,
  Calendar,
  Plus,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  Star,
  TrendingUp,
  GitPullRequest,
  MessageSquare,
  Settings,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function ReviewsPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const {
    currentWorkspaceId,
    currentWorkspace,
    currentWorkspaceLoading,
    hasWorkspaces,
  } = useWorkspace();

  if (authLoading || currentWorkspaceLoading) {
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
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Performance Reviews</h1>
            <p className="text-slate-400 mt-1">
              Track goals, contributions, and 360° feedback
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/reviews/goals/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              New Goal
            </Link>
            {hasWorkspaces && (
              <>
                <Link
                  href="/reviews/manage"
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-600/30 rounded-lg transition text-sm"
                >
                  <Users className="h-4 w-4" />
                  Management View
                </Link>
                <Link
                  href="/reviews/cycles"
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
                >
                  <Settings className="h-4 w-4" />
                  Manage Cycles
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <Target className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-slate-400 text-sm">Active Goals</span>
            </div>
            <p className="text-2xl font-bold text-white">0</p>
            <p className="text-xs text-slate-500 mt-1">In progress</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-slate-400 text-sm">Completed</span>
            </div>
            <p className="text-2xl font-bold text-white">0</p>
            <p className="text-xs text-slate-500 mt-1">This quarter</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <MessageSquare className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-slate-400 text-sm">Peer Reviews</span>
            </div>
            <p className="text-2xl font-bold text-white">0</p>
            <p className="text-xs text-slate-500 mt-1">Pending requests</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <GitPullRequest className="w-5 h-5 text-orange-400" />
              </div>
              <span className="text-slate-400 text-sm">Contributions</span>
            </div>
            <p className="text-2xl font-bold text-white">0</p>
            <p className="text-xs text-slate-500 mt-1">Auto-linked PRs</p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* My Goals */}
          <div className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                  <Target className="h-5 w-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">My Goals</h3>
              </div>
              <Link
                href="/reviews/goals"
                className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 transition"
              >
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-6">
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Target className="w-10 h-10 text-slate-500" />
                </div>
                <h3 className="text-xl font-medium text-white mb-2">No goals yet</h3>
                <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
                  Create SMART goals to track your progress and automatically link your GitHub contributions.
                </p>
                <Link
                  href="/reviews/goals/new"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Create Your First Goal
                </Link>
              </div>
            </div>
          </div>

          {/* Current Review Cycle */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Review Cycle</h3>
              </div>
            </div>
            <div className="p-6">
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-slate-500" />
                </div>
                <p className="text-slate-400 text-sm mb-4">
                  No active review cycle
                </p>
                {hasWorkspaces && (
                  <Link
                    href="/reviews/cycles"
                    className="text-purple-400 hover:text-purple-300 text-sm transition"
                  >
                    Create a review cycle
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Peer Feedback Section */}
        <div className="mt-6 grid lg:grid-cols-2 gap-6">
          {/* Pending Peer Reviews */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <MessageSquare className="h-5 w-5 text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Feedback Requests</h3>
              </div>
              <Link
                href="/reviews/peer-requests"
                className="text-amber-400 hover:text-amber-300 text-sm flex items-center gap-1 transition"
              >
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-6">
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3">
                  <MessageSquare className="w-7 h-7 text-slate-500" />
                </div>
                <p className="text-slate-400 text-sm">
                  No pending feedback requests
                </p>
              </div>
            </div>
          </div>

          {/* Contribution Summary */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <GitPullRequest className="h-5 w-5 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Contributions</h3>
              </div>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30 rounded-lg text-sm transition">
                <Sparkles className="h-3.5 w-3.5" />
                Generate Summary
              </button>
            </div>
            <div className="p-6">
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3">
                  <GitPullRequest className="w-7 h-7 text-slate-500" />
                </div>
                <p className="text-slate-400 text-sm mb-2">
                  No contribution data yet
                </p>
                <p className="text-slate-500 text-xs">
                  Your GitHub activity will appear here automatically
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Features Overview */}
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="p-2 bg-cyan-500/10 rounded-lg w-fit mb-3">
              <Target className="h-5 w-5 text-cyan-400" />
            </div>
            <h4 className="text-white font-medium mb-2">SMART Goals</h4>
            <p className="text-slate-400 text-sm">
              Set Specific, Measurable, Achievable, Relevant, and Time-bound goals with key results tracking.
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="p-2 bg-purple-500/10 rounded-lg w-fit mb-3">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
            <h4 className="text-white font-medium mb-2">360° Feedback</h4>
            <p className="text-slate-400 text-sm">
              Request anonymous peer reviews using the COIN framework (Context, Observation, Impact, Next Steps).
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="p-2 bg-emerald-500/10 rounded-lg w-fit mb-3">
              <Sparkles className="h-5 w-5 text-emerald-400" />
            </div>
            <h4 className="text-white font-medium mb-2">AI Summaries</h4>
            <p className="text-slate-400 text-sm">
              Auto-generate contribution narratives from your GitHub commits, PRs, and code reviews.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

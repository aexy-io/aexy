"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Calendar,
  Users,
  Clock,
  CheckCircle,
  UserCheck,
  MessageSquare,
  Settings,
  Play,
  Pause,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useReviewCycle } from "@/hooks/useReviews";
import { ReviewCycleStatus, reviewsApi } from "@/lib/api";

// Status colors
const statusColors: Record<ReviewCycleStatus, { text: string; bg: string; label: string }> = {
  draft: { text: "text-slate-400", bg: "bg-slate-500/10", label: "Draft" },
  active: { text: "text-blue-400", bg: "bg-blue-500/10", label: "Active" },
  self_review: { text: "text-cyan-400", bg: "bg-cyan-500/10", label: "Self Review" },
  peer_review: { text: "text-purple-400", bg: "bg-purple-500/10", label: "Peer Review" },
  manager_review: { text: "text-amber-400", bg: "bg-amber-500/10", label: "Manager Review" },
  completed: { text: "text-emerald-400", bg: "bg-emerald-500/10", label: "Completed" },
};

// Cycle type labels
const cycleTypeLabels: Record<string, string> = {
  annual: "Annual",
  semi_annual: "Semi-Annual",
  quarterly: "Quarterly",
  custom: "Custom",
};

export default function CycleDetailPage() {
  const params = useParams();
  const cycleId = params.cycleId as string;
  const { isLoading: authLoading } = useAuth();
  const { cycle, isLoading, error, refetch } = useReviewCycle(cycleId);

  const [isActivating, setIsActivating] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const handleStartCycle = async () => {
    if (!cycleId) return;
    setIsActivating(true);
    setActivateError(null);
    try {
      await reviewsApi.activateCycle(cycleId);
      await refetch();
      setShowStartConfirm(false);
    } catch (err: any) {
      setActivateError(err?.response?.data?.detail || "Failed to start cycle");
    } finally {
      setIsActivating(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading review cycle...</p>
        </div>
      </div>
    );
  }

  if (error || !cycle) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Calendar className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-medium text-white mb-2">Review cycle not found</h2>
          <p className="text-slate-400 mb-6">The review cycle you're looking for doesn't exist or you don't have access.</p>
          <Link href="/reviews/cycles" className="text-cyan-400 hover:text-cyan-300 transition">
            Back to Cycles
          </Link>
        </div>
      </div>
    );
  }

  const statusStyle = statusColors[cycle.status] || statusColors.draft;
  const completionRate = cycle.total_reviews > 0
    ? Math.round((cycle.completed_reviews / cycle.total_reviews) * 100)
    : 0;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Not set";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/reviews" className="text-slate-400 hover:text-white transition flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Reviews
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <Link href="/reviews/cycles" className="text-slate-400 hover:text-white transition">
            Cycles
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-white truncate max-w-xs">{cycle.name}</span>
        </div>

        {/* Header */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`${statusStyle.text} ${statusStyle.bg} text-sm px-3 py-1 rounded-full`}>
                {statusStyle.label}
              </span>
              <span className="text-slate-400 bg-slate-700/50 text-sm px-3 py-1 rounded-full">
                {cycleTypeLabels[cycle.cycle_type] || cycle.cycle_type}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {cycle.status === "draft" && (
                <button
                  onClick={() => setShowStartConfirm(true)}
                  className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  Start Cycle
                </button>
              )}
              {cycle.status !== "completed" && cycle.status !== "draft" && (
                <button className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition flex items-center gap-2">
                  <Pause className="h-4 w-4" />
                  Pause
                </button>
              )}
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">{cycle.name}</h1>

          {/* Period Info */}
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDate(cycle.period_start)} - {formatDate(cycle.period_end)}
            </div>
          </div>

          {/* Progress Overview */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-400">Completion Progress</span>
              <span className="text-white font-medium">{completionRate}%</span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{cycle.total_reviews}</p>
                <p className="text-sm text-slate-400">Total Reviews</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{cycle.completed_reviews}</p>
                <p className="text-sm text-slate-400">Completed</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <UserCheck className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{cycle.pending_self_reviews}</p>
                <p className="text-sm text-slate-400">Pending Self</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <MessageSquare className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{cycle.pending_peer_reviews}</p>
                <p className="text-sm text-slate-400">Pending Peer</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Phase Deadlines */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-400" />
                Phase Deadlines
              </h2>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-slate-700/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10">
                      <UserCheck className="h-4 w-4 text-cyan-400" />
                    </div>
                    <span className="text-white">Self Review</span>
                  </div>
                  <span className={`text-sm ${cycle.self_review_deadline ? "text-slate-300" : "text-slate-500"}`}>
                    {formatDate(cycle.self_review_deadline)}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-slate-700/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <MessageSquare className="h-4 w-4 text-purple-400" />
                    </div>
                    <span className="text-white">Peer Review</span>
                  </div>
                  <span className={`text-sm ${cycle.peer_review_deadline ? "text-slate-300" : "text-slate-500"}`}>
                    {formatDate(cycle.peer_review_deadline)}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-slate-700/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <Users className="h-4 w-4 text-amber-400" />
                    </div>
                    <span className="text-white">Manager Review</span>
                  </div>
                  <span className={`text-sm ${cycle.manager_review_deadline ? "text-slate-300" : "text-slate-500"}`}>
                    {formatDate(cycle.manager_review_deadline)}
                  </span>
                </div>
              </div>
            </div>

            {/* Participants Section */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-400" />
                Participants
              </h2>
              {cycle.total_reviews > 0 ? (
                <p className="text-slate-400 text-sm">
                  {cycle.total_reviews} team member{cycle.total_reviews > 1 ? "s" : ""} enrolled in this review cycle.
                </p>
              ) : cycle.status === "draft" ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm mb-2">No participants enrolled yet.</p>
                  <p className="text-slate-500 text-xs mb-4">
                    Participants will be automatically enrolled from your workspace teams when you start the cycle.
                  </p>
                  <button
                    onClick={() => setShowStartConfirm(true)}
                    className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition"
                  >
                    Start Cycle to Add Participants
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">No participants in this cycle.</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Settings Summary */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <Settings className="h-5 w-5 text-slate-400" />
                Settings
              </h2>
              {cycle.settings ? (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-slate-400">Self Review</span>
                    <span className={cycle.settings.enable_self_review ? "text-emerald-400" : "text-slate-500"}>
                      {cycle.settings.enable_self_review ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-slate-400">Peer Review</span>
                    <span className={cycle.settings.enable_peer_review ? "text-emerald-400" : "text-slate-500"}>
                      {cycle.settings.enable_peer_review ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-slate-400">Manager Review</span>
                    <span className={cycle.settings.enable_manager_review ? "text-emerald-400" : "text-slate-500"}>
                      {cycle.settings.enable_manager_review ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-slate-400">Anonymous Peer</span>
                    <span className={cycle.settings.anonymous_peer_reviews ? "text-emerald-400" : "text-slate-500"}>
                      {cycle.settings.anonymous_peer_reviews ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-slate-400">GitHub Metrics</span>
                    <span className={cycle.settings.include_github_metrics ? "text-emerald-400" : "text-slate-500"}>
                      {cycle.settings.include_github_metrics ? "Included" : "Not included"}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-slate-400">Peer Reviewers</span>
                    <span className="text-slate-300">
                      {cycle.settings.min_peer_reviewers} - {cycle.settings.max_peer_reviewers}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No settings configured.</p>
              )}
            </div>

            {/* Quick Info */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-lg font-medium text-white mb-4">Info</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Created</span>
                  <span className="text-slate-300">{formatDate(cycle.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Last Updated</span>
                  <span className="text-slate-300">{formatDate(cycle.updated_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pending Manager</span>
                  <span className="text-white">{cycle.pending_manager_reviews}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Start Cycle Confirmation Modal */}
        {showStartConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-medium text-white mb-2">Start Review Cycle?</h3>
              <p className="text-slate-400 text-sm mb-4">
                This will activate the cycle and automatically enroll all team members from your workspace.
                Individual reviews will be created for each participant.
              </p>
              {activateError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                  <p className="text-red-400 text-sm">{activateError}</p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowStartConfirm(false);
                    setActivateError(null);
                  }}
                  disabled={isActivating}
                  className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartCycle}
                  disabled={isActivating}
                  className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50"
                >
                  {isActivating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Start Cycle
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  ArrowLeft,
  Info,
  CheckCircle,
  Users,
  Settings,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useWorkspace } from "@/hooks/useWorkspace";
import { reviewsApi } from "@/lib/api";

export default function NewReviewCyclePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading, hasWorkspaces } = useWorkspace();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [cycleType, setCycleType] = useState("quarterly");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selfReviewDeadline, setSelfReviewDeadline] = useState("");
  const [peerReviewDeadline, setPeerReviewDeadline] = useState("");
  const [managerReviewDeadline, setManagerReviewDeadline] = useState("");

  // Settings
  const [enableSelfReview, setEnableSelfReview] = useState(true);
  const [enablePeerReview, setEnablePeerReview] = useState(true);
  const [enableManagerReview, setEnableManagerReview] = useState(true);
  const [anonymousPeerReviews, setAnonymousPeerReviews] = useState(true);
  const [minPeerReviewers, setMinPeerReviewers] = useState(2);
  const [maxPeerReviewers, setMaxPeerReviewers] = useState(5);
  const [peerSelectionMode, setPeerSelectionMode] = useState("both");
  const [includeGitHubMetrics, setIncludeGitHubMetrics] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspaceId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const cycle = await reviewsApi.createCycle(currentWorkspaceId, {
        name,
        cycle_type: cycleType as "annual" | "semi_annual" | "quarterly" | "custom",
        period_start: periodStart,
        period_end: periodEnd,
        self_review_deadline: selfReviewDeadline || undefined,
        peer_review_deadline: peerReviewDeadline || undefined,
        manager_review_deadline: managerReviewDeadline || undefined,
        settings: {
          enable_self_review: enableSelfReview,
          enable_peer_review: enablePeerReview,
          enable_manager_review: enableManagerReview,
          anonymous_peer_reviews: anonymousPeerReviews,
          min_peer_reviewers: minPeerReviewers,
          max_peer_reviewers: maxPeerReviewers,
          peer_selection_mode: peerSelectionMode as "employee_choice" | "manager_assigned" | "both",
          include_github_metrics: includeGitHubMetrics,
        },
      });

      router.push(`/reviews/cycles/${cycle.id}`);
    } catch (err) {
      console.error("Failed to create review cycle:", err);
      setError("Failed to create review cycle. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (!hasWorkspaces || !currentWorkspaceId) {
    return (
      <div className="min-h-screen bg-slate-950">
        <AppHeader user={user} logout={logout} />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-slate-500" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">No Workspace Selected</h2>
            <p className="text-slate-400 mb-6">
              Please create or select a workspace first.
            </p>
            <Link
              href="/settings/workspaces"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition"
            >
              <Settings className="h-4 w-4" />
              Manage Workspaces
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader user={user} logout={logout} />

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Back Link */}
        <Link
          href="/reviews/cycles"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Cycles
        </Link>

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl">
            <Calendar className="h-7 w-7 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Create Review Cycle</h1>
            <p className="text-slate-400 text-sm">
              Set up a new performance review cycle for your team
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Basic Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Cycle Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Q1 2024 Performance Review"
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Cycle Type
                </label>
                <select
                  value={cycleType}
                  onChange={(e) => setCycleType(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="annual">Annual</option>
                  <option value="semi_annual">Semi-Annual</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Period Start *
                  </label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Period End *
                  </label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Deadlines */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Phase Deadlines</h2>
            <p className="text-slate-400 text-sm mb-4">
              Set deadlines for each review phase. Leave blank for no deadline.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Self Review Deadline
                </label>
                <input
                  type="date"
                  value={selfReviewDeadline}
                  onChange={(e) => setSelfReviewDeadline(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Peer Review Deadline
                </label>
                <input
                  type="date"
                  value={peerReviewDeadline}
                  onChange={(e) => setPeerReviewDeadline(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Manager Review Deadline
                </label>
                <input
                  type="date"
                  value={managerReviewDeadline}
                  onChange={(e) => setManagerReviewDeadline(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Review Settings */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Review Settings</h2>
            <div className="space-y-4">
              {/* Enable/Disable Phases */}
              <div className="grid grid-cols-3 gap-4">
                <label className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition">
                  <input
                    type="checkbox"
                    checked={enableSelfReview}
                    onChange={(e) => setEnableSelfReview(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-slate-300">Self Review</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition">
                  <input
                    type="checkbox"
                    checked={enablePeerReview}
                    onChange={(e) => setEnablePeerReview(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-slate-300">Peer Review</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition">
                  <input
                    type="checkbox"
                    checked={enableManagerReview}
                    onChange={(e) => setEnableManagerReview(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-slate-300">Manager Review</span>
                </label>
              </div>

              {/* Peer Review Settings */}
              {enablePeerReview && (
                <div className="mt-4 pt-4 border-t border-slate-700 space-y-4">
                  <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Peer Review Settings
                  </h3>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={anonymousPeerReviews}
                      onChange={(e) => setAnonymousPeerReviews(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-slate-300">Anonymous peer reviews</span>
                  </label>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Min Peer Reviewers
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={minPeerReviewers}
                        onChange={(e) => setMinPeerReviewers(parseInt(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Max Peer Reviewers
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={maxPeerReviewers}
                        onChange={(e) => setMaxPeerReviewers(parseInt(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      Peer Selection Mode
                    </label>
                    <select
                      value={peerSelectionMode}
                      onChange={(e) => setPeerSelectionMode(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="employee_choice">Employee Choice Only</option>
                      <option value="manager_assigned">Manager Assigned Only</option>
                      <option value="both">Both (Recommended)</option>
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      &quot;Both&quot; allows employees to request reviewers and managers to assign additional ones.
                    </p>
                  </div>
                </div>
              )}

              {/* GitHub Integration */}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeGitHubMetrics}
                    onChange={(e) => setIncludeGitHubMetrics(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <span className="text-sm text-slate-300">Include GitHub metrics</span>
                    <p className="text-xs text-slate-500">
                      Auto-import commits, PRs, and code reviews from the review period
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href="/reviews/cycles"
              className="px-6 py-2.5 text-slate-400 hover:text-white transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !name || !periodStart || !periodEnd}
              className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg transition font-medium"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div>
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Create Cycle
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Plus,
  ChevronRight,
  Clock,
  CheckCircle,
  Play,
  Users,
  Settings,
  MoreVertical,
  ArrowLeft,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useReviewCycles } from "@/hooks/useReviews";
import { ReviewCycle } from "@/lib/api";

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-slate-400", bg: "bg-slate-500/10" },
  active: { label: "Active", color: "text-green-400", bg: "bg-green-500/10" },
  self_review: { label: "Self Review", color: "text-blue-400", bg: "bg-blue-500/10" },
  peer_review: { label: "Peer Review", color: "text-purple-400", bg: "bg-purple-500/10" },
  manager_review: { label: "Manager Review", color: "text-amber-400", bg: "bg-amber-500/10" },
  completed: { label: "Completed", color: "text-emerald-400", bg: "bg-emerald-500/10" },
};

const cycleTypeLabels: Record<string, string> = {
  annual: "Annual",
  semi_annual: "Semi-Annual",
  quarterly: "Quarterly",
  custom: "Custom",
};

function CycleRow({ cycle }: { cycle: ReviewCycle }) {
  const status = statusConfig[cycle.status] || statusConfig.draft;
  const [showMenu, setShowMenu] = useState(false);

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/30 transition">
      <td className="px-6 py-4">
        <Link href={`/reviews/cycles/${cycle.id}`} className="group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Calendar className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <p className="text-white font-medium group-hover:text-purple-400 transition">
                {cycle.name}
              </p>
              <p className="text-xs text-slate-500">
                {cycleTypeLabels[cycle.cycle_type] || cycle.cycle_type}
              </p>
            </div>
          </div>
        </Link>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color} ${status.bg}`}>
          {cycle.status === "active" || cycle.status === "self_review" || cycle.status === "peer_review" || cycle.status === "manager_review" ? (
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          ) : null}
          {status.label}
        </span>
      </td>
      <td className="px-6 py-4 text-sm text-slate-400">
        {new Date(cycle.period_start).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        {" - "}
        {new Date(cycle.period_end).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          {cycle.self_review_deadline && (
            <span className="text-xs text-slate-500" title="Self Review Deadline">
              <Clock className="h-3 w-3 inline mr-1" />
              {new Date(cycle.self_review_deadline).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/reviews/cycles/${cycle.id}`}
            className="px-3 py-1.5 text-sm text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition"
          >
            View
          </Link>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10">
                <Link
                  href={`/reviews/cycles/${cycle.id}`}
                  className="block px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition"
                >
                  View Details
                </Link>
                {cycle.status === "draft" && (
                  <button className="w-full text-left px-4 py-2 text-sm text-green-400 hover:bg-slate-700 transition">
                    Activate Cycle
                  </button>
                )}
                {(cycle.status === "self_review" || cycle.status === "peer_review") && (
                  <button className="w-full text-left px-4 py-2 text-sm text-amber-400 hover:bg-slate-700 transition">
                    Advance Phase
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function ReviewCyclesPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading, hasWorkspaces } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { cycles, isLoading, error, refetch } = useReviewCycles(currentWorkspaceId, statusFilter);

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading review cycles...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (!hasWorkspaces) {
    return (
      <div className="min-h-screen bg-slate-950">
<main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-slate-500" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">No Workspace Selected</h2>
            <p className="text-slate-400 mb-6">
              Review cycles are workspace-specific. Please create or select a workspace first.
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

  const statusOptions = [
    { value: undefined, label: "All Statuses" },
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "self_review", label: "Self Review" },
    { value: "peer_review", label: "Peer Review" },
    { value: "manager_review", label: "Manager Review" },
    { value: "completed", label: "Completed" },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
<main className="max-w-7xl mx-auto px-4 py-8">
        {/* Back Link */}
        <Link
          href="/reviews"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reviews
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl">
              <Calendar className="h-7 w-7 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Review Cycles</h1>
              <p className="text-slate-400 text-sm">
                Manage performance review cycles for your workspace
              </p>
            </div>
          </div>
          <Link
            href="/reviews/cycles/new"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            New Cycle
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <select
            value={statusFilter || ""}
            onChange={(e) => setStatusFilter(e.target.value || undefined)}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {statusOptions.map((option) => (
              <option key={option.label} value={option.value || ""}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="text-slate-500 text-sm">
            {cycles.length} cycle{cycles.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Cycles Table */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400">Failed to load review cycles</p>
              <button
                onClick={refetch}
                className="mt-4 text-purple-400 hover:text-purple-300"
              >
                Try again
              </button>
            </div>
          ) : cycles.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-10 h-10 text-slate-500" />
              </div>
              <h3 className="text-xl font-medium text-white mb-2">No review cycles yet</h3>
              <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
                Create your first review cycle to start collecting 360° feedback from your team.
              </p>
              <Link
                href="/reviews/cycles/new"
                className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition font-medium"
              >
                <Plus className="h-4 w-4" />
                Create First Cycle
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Cycle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Deadlines
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((cycle) => (
                  <CycleRow key={cycle.id} cycle={cycle} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          <div className="bg-slate-900/30 rounded-xl p-5 border border-slate-800/50">
            <div className="p-2 bg-blue-500/10 rounded-lg w-fit mb-3">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            <h4 className="text-white font-medium mb-2">Self Review Phase</h4>
            <p className="text-slate-400 text-sm">
              Team members reflect on their achievements and areas for growth using structured prompts.
            </p>
          </div>
          <div className="bg-slate-900/30 rounded-xl p-5 border border-slate-800/50">
            <div className="p-2 bg-purple-500/10 rounded-lg w-fit mb-3">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
            <h4 className="text-white font-medium mb-2">Peer Review Phase</h4>
            <p className="text-slate-400 text-sm">
              Collect anonymous 360° feedback from colleagues using the COIN framework.
            </p>
          </div>
          <div className="bg-slate-900/30 rounded-xl p-5 border border-slate-800/50">
            <div className="p-2 bg-amber-500/10 rounded-lg w-fit mb-3">
              <CheckCircle className="h-5 w-5 text-amber-400" />
            </div>
            <h4 className="text-white font-medium mb-2">Manager Review Phase</h4>
            <p className="text-slate-400 text-sm">
              Managers synthesize feedback and provide final ratings and development recommendations.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

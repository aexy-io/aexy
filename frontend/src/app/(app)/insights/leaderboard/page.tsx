"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Crown,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  Code,
} from "lucide-react";
import { useLeaderboard } from "@/hooks/useInsights";
import { InsightsPeriodType } from "@/lib/api";

const PERIOD_OPTIONS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sprint", label: "Sprint" },
];

const METRIC_OPTIONS = [
  { value: "commits", label: "Commits", icon: GitCommit },
  { value: "prs_merged", label: "PRs Merged", icon: GitPullRequest },
  { value: "reviews", label: "Reviews", icon: MessageSquare },
  { value: "lines_changed", label: "Lines Changed", icon: Code },
];

export default function LeaderboardPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("weekly");
  const [metric, setMetric] = useState("commits");

  const { leaderboard, isLoading } = useLeaderboard(currentWorkspaceId, {
    metric,
    period_type: periodType,
    limit: 50,
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const maxValue = leaderboard?.entries.length
    ? Math.max(...leaderboard.entries.map((e) => e.value))
    : 1;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/insights"
            className="text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Crown className="h-6 w-6 text-amber-400" />
              Leaderboard
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Ranked developer metrics
            </p>
          </div>
        </div>
        <div className="flex bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriodType(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                periodType === opt.value
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Selector */}
      <div className="flex gap-2">
        {METRIC_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              onClick={() => setMetric(opt.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                metric === opt.value
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Leaderboard Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-slate-800 rounded-xl animate-pulse border border-slate-700"
            />
          ))}
        </div>
      ) : leaderboard?.entries.length ? (
        <div className="space-y-2">
          {leaderboard.entries.map((entry, i) => (
            <div
              key={entry.developer_id}
              className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex items-center gap-4"
            >
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  i === 0
                    ? "bg-amber-500/20 text-amber-400"
                    : i === 1
                      ? "bg-slate-400/20 text-slate-300"
                      : i === 2
                        ? "bg-orange-500/20 text-orange-400"
                        : "bg-slate-700 text-slate-400"
                }`}
              >
                {entry.rank}
              </span>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/insights/developers/${entry.developer_id}`}
                  className="text-sm text-white hover:text-indigo-300 font-medium"
                >
                  {entry.developer_name || entry.developer_id.slice(0, 12)}
                </Link>
                <div className="mt-1.5 w-full bg-slate-700 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                    style={{
                      width: `${(entry.value / maxValue) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-lg font-mono font-bold text-white shrink-0">
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
          <p className="text-slate-400">
            No leaderboard data available. Generate snapshots first.
          </p>
        </div>
      )}
    </div>
  );
}

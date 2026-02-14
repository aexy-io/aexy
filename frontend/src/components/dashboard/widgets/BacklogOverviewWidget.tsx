"use client";

import Link from "next/link";
import {
  Layers,
  ChevronRight,
  CheckCircle2,
  Circle,
  PlayCircle,
  AlertCircle,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useStories } from "@/hooks/useStories";

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: any; color: string; bgColor: string }
> = {
  backlog: {
    label: "Backlog",
    icon: Circle,
    color: "text-slate-400",
    bgColor: "bg-slate-500/20",
  },
  ready: {
    label: "Ready",
    icon: AlertCircle,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
  },
  in_progress: {
    label: "In Progress",
    icon: PlayCircle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
  },
  done: {
    label: "Done",
    icon: CheckCircle2,
    color: "text-green-400",
    bgColor: "bg-green-500/20",
  },
};

export function BacklogOverviewWidget() {
  const { currentWorkspace } = useWorkspace();
  const { stories, total, isLoading } = useStories(
    currentWorkspace?.id || null
  );

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-slate-800 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-16 bg-slate-800 rounded-lg" />
          <div className="h-3 bg-slate-800 rounded-full" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-16 bg-slate-800 rounded-lg" />
            <div className="h-16 bg-slate-800 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // Count stories by status
  const statusCounts: Record<string, number> = {};
  let totalPoints = 0;
  let completedPoints = 0;

  (stories || []).forEach((story: any) => {
    const status = story.status || "backlog";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const points = story.story_points || 0;
    totalPoints += points;
    if (status === "done" || status === "completed") {
      completedPoints += points;
    }
  });

  const pointsProgress =
    totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Layers className="h-5 w-5 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Backlog Overview</h3>
        </div>
        <Link
          href="/stories"
          className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              Select a workspace to view backlog.
            </p>
          </div>
        ) : total === 0 ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm mb-4">
              No stories in your backlog yet.
            </p>
            <Link
              href="/stories/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition"
            >
              Create Story
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Story points progress */}
            {totalPoints > 0 && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Story Points</span>
                  <span className="text-white font-medium tabular-nums">
                    {completedPoints} / {totalPoints} pts ({pointsProgress}%)
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all"
                    style={{ width: `${pointsProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Status breakdown cards */}
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(STATUS_CONFIG).map(([status, config]) => {
                const count = statusCounts[status] || 0;
                const Icon = config.icon;
                return (
                  <div
                    key={status}
                    className="p-3 bg-slate-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                      <span className="text-slate-400 text-xs">
                        {config.label}
                      </span>
                    </div>
                    <p className="text-xl font-bold text-white tabular-nums">
                      {count}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Total */}
            <div className="text-center text-slate-500 text-xs pt-1">
              {total} total stories
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

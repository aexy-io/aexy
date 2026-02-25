"use client";

import Link from "next/link";
import { GraduationCap, ChevronRight, BookOpen, CheckCircle, Clock, Timer } from "lucide-react";
import { useActivityStats } from "@/hooks/useLearningActivities";
import { useAuth } from "@/hooks/useAuth";

function formatMinutesToHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function LearningPathWidget() {
  const { user } = useAuth();
  const { stats, isLoading } = useActivityStats(user?.id || null);

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const totalActivities = stats?.total_activities || 0;
  const completed = stats?.completed_activities || 0;
  const inProgress = stats?.in_progress_activities || 0;
  const totalTimeMinutes = stats?.total_time_spent_minutes || 0;

  const statItems = [
    {
      label: "Total",
      value: String(totalActivities),
      icon: BookOpen,
      iconColor: "text-indigo-400",
      iconBg: "bg-indigo-500/10",
    },
    {
      label: "Completed",
      value: String(completed),
      icon: CheckCircle,
      iconColor: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
    },
    {
      label: "In Progress",
      value: String(inProgress),
      icon: Clock,
      iconColor: "text-amber-400",
      iconBg: "bg-amber-500/10",
    },
    {
      label: "Time Spent",
      value: formatMinutesToHours(totalTimeMinutes),
      icon: Timer,
      iconColor: "text-blue-400",
      iconBg: "bg-blue-500/10",
    },
  ];

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg">
            <GraduationCap className="h-5 w-5 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Learning Path</h3>
        </div>
        <Link
          href="/learning"
          className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {totalActivities === 0 && !isLoading ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm mb-4">
              No learning activities yet. Start tracking your learning journey.
            </p>
            <Link
              href="/learning"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-foreground rounded-lg text-sm font-medium transition"
            >
              Start Learning
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {statItems.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="p-4 bg-muted/50 rounded-lg border border-border/50"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 ${stat.iconBg} rounded-lg`}>
                      <Icon className={`w-4 h-4 ${stat.iconColor}`} />
                    </div>
                    <span className="text-muted-foreground text-sm">{stat.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

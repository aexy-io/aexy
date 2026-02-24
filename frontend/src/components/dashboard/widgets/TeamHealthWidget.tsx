"use client";

import Link from "next/link";
import {
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Users,
  Activity,
  ChevronRight,
  Zap,
  Shield,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams, useTeamMembers } from "@/hooks/useTeams";
import { useActiveBlockers } from "@/hooks/useTracking";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/lib/api";

interface HealthSignal {
  label: string;
  score: number; // 0-100
  trend: "up" | "down" | "stable";
  icon: React.ReactNode;
  color: string;
}

function getHealthGrade(score: number): { label: string; color: string; bg: string } {
  if (score >= 85) return { label: "Excellent", color: "text-green-400", bg: "bg-green-500" };
  if (score >= 70) return { label: "Good", color: "text-blue-400", bg: "bg-blue-500" };
  if (score >= 50) return { label: "Fair", color: "text-amber-400", bg: "bg-amber-500" };
  return { label: "At Risk", color: "text-red-400", bg: "bg-red-500" };
}

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="h-3 w-3 text-green-400" />;
  if (trend === "down") return <TrendingDown className="h-3 w-3 text-red-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export function TeamHealthWidget() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { teams } = useTeams(workspaceId);
  const defaultTeamId = teams?.[0]?.id || null;
  const { members } = useTeamMembers(workspaceId, defaultTeamId);
  const { data: blockerData } = useActiveBlockers(defaultTeamId || undefined);

  const memberIds = (members || []).map((m: any) => m.developer_id || m.id).filter(Boolean);
  const { data: workloadData } = useQuery({
    queryKey: ["workloadDistribution", workspaceId, memberIds],
    queryFn: () => analyticsApi.getWorkloadDistribution(memberIds),
    enabled: !!workspaceId && memberIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Compute health signals from available data
  const activeBlockers = blockerData?.active_count || 0;
  const escalatedBlockers = blockerData?.escalated_count || 0;
  const teamSize = memberIds.length || 1;

  // Blocker health: fewer blockers per person = healthier
  const blockerRatio = activeBlockers / Math.max(teamSize, 1);
  const blockerScore = Math.max(0, Math.min(100, 100 - blockerRatio * 40 - escalatedBlockers * 15));

  // Workload balance: lower imbalance = healthier
  const imbalanceScore = workloadData?.imbalance_score ?? 0;
  const workloadScore = Math.max(0, Math.min(100, 100 - imbalanceScore * 100));

  // Activity health: baseline score, adjusted by team size activity
  const activityScore = memberIds.length > 0 ? 75 : 50;

  // Overall score (weighted average)
  const overallScore = Math.round(blockerScore * 0.3 + workloadScore * 0.35 + activityScore * 0.35);
  const grade = getHealthGrade(overallScore);

  const signals: HealthSignal[] = [
    {
      label: "Blockers",
      score: Math.round(blockerScore),
      trend: escalatedBlockers > 0 ? "down" : activeBlockers === 0 ? "up" : "stable",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      color: blockerScore >= 70 ? "text-green-400" : blockerScore >= 50 ? "text-amber-400" : "text-red-400",
    },
    {
      label: "Workload Balance",
      score: Math.round(workloadScore),
      trend: imbalanceScore < 0.3 ? "up" : imbalanceScore > 0.6 ? "down" : "stable",
      icon: <Users className="h-3.5 w-3.5" />,
      color: workloadScore >= 70 ? "text-green-400" : workloadScore >= 50 ? "text-amber-400" : "text-red-400",
    },
    {
      label: "Team Activity",
      score: Math.round(activityScore),
      trend: "stable",
      icon: <Activity className="h-3.5 w-3.5" />,
      color: activityScore >= 70 ? "text-green-400" : activityScore >= 50 ? "text-amber-400" : "text-red-400",
    },
  ];

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pink-500/10 rounded-lg">
            <Heart className="h-5 w-5 text-pink-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Team Health</h3>
        </div>
        <Link
          href="/insights"
          className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 transition"
        >
          Details <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="p-6">
        {/* Overall Score */}
        <div className="flex items-center gap-6 mb-6">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                className="text-muted/30"
              />
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeDasharray={`${(overallScore / 100) * 213.6} 213.6`}
                strokeLinecap="round"
                className={grade.color}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-foreground">{overallScore}</span>
            </div>
          </div>
          <div>
            <div className={`text-sm font-semibold ${grade.color}`}>{grade.label}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Based on {signals.length} health signals
            </p>
          </div>
        </div>

        {/* Individual Signals */}
        <div className="space-y-3">
          {signals.map((signal) => (
            <div key={signal.label} className="flex items-center gap-3">
              <span className={`flex-shrink-0 ${signal.color}`}>{signal.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{signal.label}</span>
                  <div className="flex items-center gap-1.5">
                    <TrendIcon trend={signal.trend} />
                    <span className={`text-xs font-medium ${signal.color}`}>{signal.score}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      signal.score >= 70 ? "bg-green-500" : signal.score >= 50 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${signal.score}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        {overallScore < 70 && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-medium mb-1">
              <Shield className="h-3.5 w-3.5" />
              Attention needed
            </div>
            <p className="text-xs text-muted-foreground">
              {activeBlockers > 2 && `${activeBlockers} active blockers need resolution. `}
              {imbalanceScore > 0.5 && "Workload is unevenly distributed. "}
              {overallScore < 50 && "Consider a team check-in."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

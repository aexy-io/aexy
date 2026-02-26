"use client";

import Link from "next/link";
import {
  Flame,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Moon,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface BurnoutIndicator {
  developer_id: string;
  developer_name: string;
  risk_level: "low" | "moderate" | "high" | "critical";
  risk_score: number;
  trend: "improving" | "stable" | "worsening";
  indicators: {
    after_hours_pct: number;
    weekend_work_days: number;
    consecutive_high_days: number;
    days_since_break: number;
  };
}

interface TeamBurnoutOverview {
  team_id: string;
  members: BurnoutIndicator[];
  risk_distribution: Record<string, number>;
  high_risk_count: number;
}

const RISK_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  low: { bg: "bg-green-500/10", text: "text-green-400", dot: "bg-green-500" },
  moderate: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-500" },
  high: { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-500" },
  critical: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-500" },
};

function TrendBadge({ trend }: { trend: string }) {
  if (trend === "improving")
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-green-400">
        <TrendingDown className="h-2.5 w-2.5" /> Improving
      </span>
    );
  if (trend === "worsening")
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-red-400">
        <TrendingUp className="h-2.5 w-2.5" /> Worsening
      </span>
    );
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <Minus className="h-2.5 w-2.5" /> Stable
    </span>
  );
}

export function BurnoutRiskWidget() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { teams } = useTeams(workspaceId);
  const defaultTeamId = teams?.[0]?.id || null;

  const { data, isLoading } = useQuery<TeamBurnoutOverview>({
    queryKey: ["teamBurnout", workspaceId, defaultTeamId],
    queryFn: async () => {
      const response = await api.get(
        `/workspaces/${workspaceId}/teams/${defaultTeamId}/burnout`
      );
      return response.data;
    },
    enabled: !!workspaceId && !!defaultTeamId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const members = data?.members || [];
  const highRiskCount = data?.high_risk_count || members.filter((m) => m.risk_level === "high" || m.risk_level === "critical").length;
  const riskDistribution = data?.risk_distribution || {};

  // Sort: critical first, then high, moderate, low
  const riskOrder = ["critical", "high", "moderate", "low"];
  const sortedMembers = [...members].sort(
    (a, b) => riskOrder.indexOf(a.risk_level) - riskOrder.indexOf(b.risk_level)
  );

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-orange-500/10 rounded-lg shrink-0">
            <Flame className="h-4 w-4 text-orange-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">Burnout Risk</h3>
          {highRiskCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-full">
              {highRiskCount} at risk
            </span>
          )}
        </div>
        <Link
          href="/insights"
          className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          Details <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="p-6">
        {members.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No burnout data available yet. Burnout detection requires GitHub activity data.
            </p>
          </div>
        ) : (
          <>
            {/* Risk Distribution Summary */}
            <div className="flex gap-3 mb-4">
              {riskOrder.map((level) => {
                const count = riskDistribution[level] || 0;
                if (count === 0) return null;
                const colors = RISK_COLORS[level];
                return (
                  <div
                    key={level}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${colors.bg}`}
                  >
                    <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className={`text-xs font-medium ${colors.text}`}>
                      {count} {level}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Member List */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {sortedMembers.slice(0, 8).map((member) => {
                const colors = RISK_COLORS[member.risk_level];
                return (
                  <div
                    key={member.developer_id}
                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                      {member.developer_name?.[0] || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {member.developer_name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${colors.bg} ${colors.text}`}
                        >
                          {member.risk_level}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        {member.indicators?.after_hours_pct > 20 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Moon className="h-2.5 w-2.5" />
                            {Math.round(member.indicators.after_hours_pct)}% after-hours
                          </span>
                        )}
                        {member.indicators?.days_since_break > 14 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Calendar className="h-2.5 w-2.5" />
                            {member.indicators.days_since_break}d since break
                          </span>
                        )}
                        <TrendBadge trend={member.trend} />
                      </div>
                    </div>
                    {/* Risk bar */}
                    <div className="w-12 flex-shrink-0">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${colors.dot}`}
                          style={{ width: `${member.risk_score * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

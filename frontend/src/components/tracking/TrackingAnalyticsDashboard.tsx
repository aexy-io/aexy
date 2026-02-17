"use client";

import { useMemo } from "react";
import {
  Activity,
  MessageSquare,
  Clock,
  AlertTriangle,
  Users,
  TrendingUp,
  Smile,
  User,
} from "lucide-react";
import { TeamAnalytics, TeamDashboard, Standup, TimeEntry, Blocker } from "@/lib/api";
import { MetricCard, metricPresets, SentimentIndicator, TeamSentimentOverview } from "./shared";
import { TrendLineChart, trendColors, UtilizationGauge } from "./charts";

interface TeamMemberCardProps {
  member: {
    developer_id: string;
    name?: string;
    avatar_url?: string | null;
    standups_submitted?: number;
    time_logged?: number;
    blockers_reported?: number;
    sentiment_avg?: number;
    streak_days?: number;
    has_standup_today?: boolean;
    time_logged_this_week?: number;
    active_blockers_count?: number;
  };
  className?: string;
}

function TeamMemberCard({ member, className = "" }: TeamMemberCardProps) {
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  return (
    <div className={`bg-muted rounded-xl border border-border p-4 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        {member.avatar_url ? (
          <img
            src={member.avatar_url}
            alt={member.name || ""}
            className="w-10 h-10 rounded-full"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div>
          <p className="font-medium text-foreground">{member.name || "Unknown"}</p>
          {member.streak_days !== undefined && member.streak_days > 0 && (
            <p className="text-xs text-amber-400">{member.streak_days} day streak</p>
          )}
        </div>
        {member.has_standup_today !== undefined && (
          <div
            className={`ml-auto w-3 h-3 rounded-full ${
              member.has_standup_today ? "bg-green-500" : "bg-muted"
            }`}
            title={member.has_standup_today ? "Standup submitted" : "No standup yet"}
          />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-background rounded-lg p-2">
          <p className="text-lg font-semibold text-foreground">
            {member.standups_submitted ?? member.time_logged_this_week !== undefined ? formatDuration(member.time_logged_this_week || 0) : "-"}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase">
            {member.time_logged_this_week !== undefined ? "Time" : "Standups"}
          </p>
        </div>
        <div className="bg-background rounded-lg p-2">
          <p className="text-lg font-semibold text-foreground">
            {member.active_blockers_count ?? member.blockers_reported ?? 0}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase">Blockers</p>
        </div>
        <div className="bg-background rounded-lg p-2">
          {member.sentiment_avg !== undefined ? (
            <>
              <p className={`text-lg font-semibold ${
                member.sentiment_avg >= 0.6 ? "text-green-400" :
                member.sentiment_avg >= 0.4 ? "text-yellow-400" : "text-red-400"
              }`}>
                {Math.round(member.sentiment_avg * 100)}%
              </p>
              <p className="text-[10px] text-muted-foreground uppercase">Mood</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-muted-foreground">-</p>
              <p className="text-[10px] text-muted-foreground uppercase">Mood</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface SprintHealthIndicatorProps {
  participationRate: number;
  blockerCount: number;
  avgSentiment?: number;
  className?: string;
}

function SprintHealthIndicator({
  participationRate,
  blockerCount,
  avgSentiment,
  className = "",
}: SprintHealthIndicatorProps) {
  const getHealthStatus = () => {
    let score = 0;

    // Participation (40%)
    if (participationRate >= 90) score += 40;
    else if (participationRate >= 70) score += 30;
    else if (participationRate >= 50) score += 20;
    else score += 10;

    // Blockers (30%)
    if (blockerCount === 0) score += 30;
    else if (blockerCount <= 2) score += 20;
    else if (blockerCount <= 5) score += 10;

    // Sentiment (30%)
    if (avgSentiment) {
      if (avgSentiment >= 0.7) score += 30;
      else if (avgSentiment >= 0.5) score += 20;
      else if (avgSentiment >= 0.3) score += 10;
    } else {
      score += 15; // Neutral if no data
    }

    if (score >= 80) return { label: "Excellent", color: "text-green-400", bgColor: "bg-green-900/30" };
    if (score >= 60) return { label: "Good", color: "text-blue-400", bgColor: "bg-blue-900/30" };
    if (score >= 40) return { label: "Fair", color: "text-yellow-400", bgColor: "bg-yellow-900/30" };
    return { label: "Needs Attention", color: "text-red-400", bgColor: "bg-red-900/30" };
  };

  const health = getHealthStatus();

  return (
    <div className={`bg-muted rounded-xl border border-border p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5 text-purple-400" />
        Sprint Health
      </h3>
      <div className={`text-center py-4 ${health.bgColor} rounded-lg`}>
        <p className={`text-2xl font-bold ${health.color}`}>{health.label}</p>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Participation</span>
          <span className={participationRate >= 80 ? "text-green-400" : "text-amber-400"}>
            {Math.round(participationRate)}%
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Active Blockers</span>
          <span className={blockerCount === 0 ? "text-green-400" : "text-red-400"}>
            {blockerCount}
          </span>
        </div>
        {avgSentiment !== undefined && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Team Mood</span>
            <span className={avgSentiment >= 0.6 ? "text-green-400" : "text-amber-400"}>
              {Math.round(avgSentiment * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface TrackingAnalyticsDashboardProps {
  analytics?: TeamAnalytics;
  teamDashboard?: TeamDashboard;
  standups?: Standup[];
  timeEntries?: TimeEntry[];
  blockers?: Blocker[];
  isLoading?: boolean;
  className?: string;
}

export function TrackingAnalyticsDashboard({
  analytics,
  teamDashboard,
  standups = [],
  timeEntries = [],
  blockers = [],
  isLoading = false,
  className = "",
}: TrackingAnalyticsDashboardProps) {
  // Compute metrics from available data
  const metrics = useMemo(() => {
    if (analytics) {
      return {
        totalStandups: analytics.metrics.total_standups,
        participationRate: analytics.metrics.standup_participation_rate,
        totalTimeLogged: analytics.metrics.total_time_logged,
        totalBlockers: analytics.metrics.total_blockers_reported,
        resolvedBlockers: analytics.metrics.total_blockers_resolved,
        avgResolutionHours: analytics.metrics.avg_blocker_resolution_hours,
        avgSentiment: analytics.sentiment_analysis.average_score,
        sentimentDistribution: analytics.sentiment_analysis.distribution,
      };
    }

    // Calculate from raw data
    const sentimentScores = standups
      .filter((s) => s.sentiment_score !== null && s.sentiment_score !== undefined)
      .map((s) => s.sentiment_score as number);

    return {
      totalStandups: standups.length,
      participationRate: teamDashboard?.participation_rate || 0,
      totalTimeLogged: timeEntries.reduce((sum, e) => sum + e.duration_minutes, 0),
      totalBlockers: blockers.length,
      resolvedBlockers: blockers.filter((b) => b.status === "resolved").length,
      avgResolutionHours: 0,
      avgSentiment: sentimentScores.length > 0
        ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
        : undefined,
      sentimentDistribution: undefined,
    };
  }, [analytics, teamDashboard, standups, timeEntries, blockers]);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // Build trend data
  const trendData = useMemo(() => {
    if (analytics?.trends) {
      return analytics.trends.standups_by_day.map((d, i) => ({
        date: d.date,
        standups: d.count,
        time: analytics.trends.time_by_day?.[i]?.minutes || 0,
      }));
    }
    return [];
  }, [analytics]);

  // Get member metrics
  const memberMetrics = useMemo(() => {
    if (analytics?.member_metrics) {
      return analytics.member_metrics;
    }
    if (teamDashboard?.member_summaries) {
      return teamDashboard.member_summaries.map((m) => ({
        developer_id: m.developer_id,
        name: m.name,
        avatar_url: m.avatar_url,
        has_standup_today: m.has_standup_today,
        time_logged_this_week: m.time_logged_this_week,
        active_blockers_count: m.active_blockers_count,
      }));
    }
    return [];
  }, [analytics, teamDashboard]);

  if (isLoading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-muted rounded-xl p-6 border border-border animate-pulse">
              <div className="h-4 bg-accent rounded w-1/2 mb-3" />
              <div className="h-8 bg-accent rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Standups"
          value={metrics.totalStandups}
          subtitle={`${Math.round(metrics.participationRate)}% participation`}
          icon={MessageSquare}
          {...metricPresets.standup}
        />
        <MetricCard
          title="Time Logged"
          value={formatDuration(metrics.totalTimeLogged)}
          icon={Clock}
          {...metricPresets.time}
        />
        <MetricCard
          title="Blockers"
          value={metrics.totalBlockers}
          subtitle={`${metrics.resolvedBlockers} resolved`}
          icon={AlertTriangle}
          {...metricPresets.blocker}
        />
        {metrics.avgSentiment !== undefined && (
          <div className="bg-muted rounded-xl border border-border p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-900/30 rounded-lg">
                <Smile className="h-5 w-5 text-amber-400" />
              </div>
              <span className="text-muted-foreground text-sm">Team Mood</span>
            </div>
            <SentimentIndicator score={metrics.avgSentiment} showLabel showEmoji size="lg" />
          </div>
        )}
      </div>

      {/* Health & Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SprintHealthIndicator
          participationRate={metrics.participationRate}
          blockerCount={metrics.totalBlockers - metrics.resolvedBlockers}
          avgSentiment={metrics.avgSentiment}
        />

        {trendData.length > 0 ? (
          <div className="lg:col-span-2">
            <TrendLineChart
              data={trendData}
              lines={[
                { key: "standups", name: "Standups", color: trendColors.standups },
                { key: "time", name: "Time (min)", color: trendColors.time, showArea: true },
              ]}
              title="Activity Trends"
              height={250}
            />
          </div>
        ) : (
          <div className="lg:col-span-2 bg-muted rounded-xl border border-border p-6 flex items-center justify-center">
            <p className="text-muted-foreground">No trend data available</p>
          </div>
        )}
      </div>

      {/* Sentiment Distribution */}
      {metrics.sentimentDistribution && (
        <div className="bg-muted rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Sentiment Distribution</h3>
          <TeamSentimentOverview
            scores={standups
              .filter((s) => s.sentiment_score !== null && s.sentiment_score !== undefined)
              .map((s) => s.sentiment_score as number)}
          />
        </div>
      )}

      {/* Team Members */}
      {memberMetrics.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            Team Members
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {memberMetrics.map((member) => (
              <TeamMemberCard key={member.developer_id} member={member} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

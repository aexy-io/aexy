"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  MessageSquare,
  Clock,
  AlertTriangle,
  ChevronRight,
  Ticket,
  Zap,
  UserCheck,
  XCircle,
  Users,
  TrendingUp,
  BarChart3,
  Calendar,
  Plus,
} from "lucide-react";
import { IndividualTrackingDashboard } from "@/components/tracking";
import {
  MetricCard,
  metricPresets,
  ActivityFeed,
  ActivityItem,
  createActivityFromStandup,
  createActivityFromTimeEntry,
  createActivityFromBlocker,
} from "@/components/tracking/shared";
import {
  useTrackingDashboard,
  useSubmitStandup,
  useLogTime,
  useReportBlocker,
  useResolveBlocker,
} from "@/hooks/useTracking";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTicketStats } from "@/hooks/useTicketing";
import { useTeams } from "@/hooks/useTeams";

export default function TrackingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { teams, isLoading: teamsLoading } = useTeams(workspaceId);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const { data: dashboard, isLoading } = useTrackingDashboard();
  const { stats: ticketStats } = useTicketStats(workspaceId);
  const submitStandup = useSubmitStandup();
  const logTime = useLogTime();
  const reportBlocker = useReportBlocker();
  const resolveBlocker = useResolveBlocker();

  // Auto-select first team when teams load
  useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  // Build activity feed from dashboard data
  const recentActivity = useMemo<ActivityItem[]>(() => {
    const activities: ActivityItem[] = [];

    // Add recent standups
    dashboard?.recent_standups?.slice(0, 3).forEach((standup) => {
      activities.push(createActivityFromStandup({
        id: standup.id,
        submitted_at: standup.submitted_at || standup.created_at,
        developer: standup.developer,
      }));
    });

    // Add recent time entries
    dashboard?.time_entries?.slice(0, 3).forEach((entry) => {
      activities.push(createActivityFromTimeEntry({
        id: entry.id,
        duration_minutes: entry.duration_minutes,
        description: entry.description,
        created_at: entry.created_at,
        task: entry.task,
        developer: entry.developer,
      }));
    });

    // Add blockers
    dashboard?.active_blockers?.slice(0, 2).forEach((blocker) => {
      activities.push(createActivityFromBlocker({
        id: blocker.id,
        description: blocker.description,
        status: blocker.status,
        severity: blocker.severity,
        reported_at: blocker.reported_at,
        updated_at: blocker.updated_at,
        developer: blocker.developer,
      }));
    });

    // Sort by timestamp
    return activities.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    }).slice(0, 8);
  }, [dashboard]);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const quickLinks = [
    {
      label: "Standups",
      description: "View standup history",
      icon: MessageSquare,
      color: "text-info",
      bgColor: "bg-info/10",
      href: "/tracking/standups",
    },
    {
      label: "Time Reports",
      description: "Track time logs",
      icon: Clock,
      color: "text-success",
      bgColor: "bg-success/10",
      href: "/tracking/time",
    },
    {
      label: "Blockers",
      description: "Manage blockers",
      icon: AlertTriangle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      href: "/tracking/blockers",
    },
    {
      label: "Analytics",
      description: "Team insights",
      icon: BarChart3,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      href: "/tracking/analytics",
    },
  ];

  const quickActions = [
    {
      label: "Submit Standup",
      icon: MessageSquare,
      color: "bg-info hover:bg-info/90",
      onClick: () => {
        // Scroll to standup form
        document.getElementById("standup-section")?.scrollIntoView({ behavior: "smooth" });
      },
    },
    {
      label: "Log Time",
      icon: Clock,
      color: "bg-success hover:bg-success/90",
      onClick: () => {
        document.getElementById("time-section")?.scrollIntoView({ behavior: "smooth" });
      },
    },
    {
      label: "Report Blocker",
      icon: AlertTriangle,
      color: "bg-destructive hover:bg-destructive/90",
      onClick: () => {
        document.getElementById("blocker-section")?.scrollIntoView({ behavior: "smooth" });
      },
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <Activity className="h-8 w-8 text-success" />
                My Tracking
              </h1>
              <p className="text-muted-foreground mt-2">
                Track your daily progress, time, and blockers
              </p>
            </div>
            {/* Team Selector */}
            {teams.length > 1 && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <select
                  value={selectedTeamId || ""}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard
            title="Standup Streak"
            value={`${dashboard?.standup_streak || 0} days`}
            subtitle={dashboard?.has_standup_today ? "Today complete" : "Submit today's standup"}
            icon={MessageSquare}
            {...metricPresets.standup}
            loading={isLoading}
            onClick={() => router.push("/tracking/standups")}
          />
          <MetricCard
            title="Time This Week"
            value={formatDuration(dashboard?.weekly_summary.total_time_logged || 0)}
            subtitle={`${dashboard?.time_entries?.length || 0} entries`}
            icon={Clock}
            {...metricPresets.time}
            loading={isLoading}
            onClick={() => router.push("/tracking/time")}
          />
          <MetricCard
            title="Active Blockers"
            value={dashboard?.active_blockers?.length || 0}
            subtitle={`${dashboard?.resolved_blockers_count || 0} resolved`}
            icon={AlertTriangle}
            {...metricPresets.blocker}
            trend={
              dashboard?.resolved_blockers_count && dashboard?.active_blockers?.length !== undefined
                ? {
                    value: -dashboard.active_blockers.length,
                    isPositive: dashboard.active_blockers.length === 0,
                  }
                : undefined
            }
            loading={isLoading}
            onClick={() => router.push("/tracking/blockers")}
          />
          <MetricCard
            title="Work Logs"
            value={dashboard?.weekly_summary.work_logs_count || 0}
            subtitle="This week"
            icon={Activity}
            {...metricPresets.activity}
            loading={isLoading}
          />
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-warning" />
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition ${action.color}`}
                >
                  <Icon className="h-4 w-4" />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Links & Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Quick Links */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <ChevronRight className="h-5 w-5 text-primary" />
              Navigate
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quickLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <button
                    key={link.href}
                    onClick={() => router.push(link.href)}
                    className="bg-card rounded-xl p-4 border border-border hover:border-border-strong transition flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${link.bgColor}`}>
                        <Icon className={`h-5 w-5 ${link.color}`} />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-foreground">{link.label}</p>
                        <p className="text-sm text-muted-foreground">{link.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-success" />
                Recent Activity
              </h3>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-8 h-8 bg-muted rounded-lg shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ActivityFeed
                  activities={recentActivity}
                  maxItems={6}
                  compact
                  emptyMessage="No recent activity. Start by submitting a standup!"
                />
              )}
            </div>
          </div>
        </div>

        {/* Ticket Metrics */}
        {ticketStats && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Ticket className="h-5 w-5 text-pink-500" />
                Ticket Overview
              </h2>
              <button
                onClick={() => router.push("/tickets")}
                className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
              >
                View all tickets
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="Open"
                value={ticketStats.open_tickets}
                icon={Ticket}
                iconColor="text-info"
                iconBgColor="bg-info/10"
              />
              <MetricCard
                title="Assigned to Me"
                value={ticketStats.assigned_to_me || 0}
                icon={UserCheck}
                iconColor="text-purple-500"
                iconBgColor="bg-purple-500/10"
              />
              <MetricCard
                title="Unassigned"
                value={ticketStats.unassigned || 0}
                icon={Zap}
                iconColor="text-warning"
                iconBgColor="bg-warning/10"
              />
              <MetricCard
                title="SLA Breached"
                value={ticketStats.sla_breached}
                icon={XCircle}
                iconColor="text-destructive"
                iconBgColor="bg-destructive/10"
              />
            </div>
          </div>
        )}

        {/* No Team Warning */}
        {teams.length === 0 && !teamsLoading && (
          <div className="mb-8 p-4 bg-warning/10 border border-warning/30 rounded-xl">
            <p className="text-warning text-sm">
              You need to be part of a team to submit standups and report blockers. Please contact your workspace admin to be added to a team.
            </p>
          </div>
        )}

        {/* Main Dashboard */}
        <div id="standup-section">
          <IndividualTrackingDashboard
            dashboard={dashboard}
            isLoading={isLoading || teamsLoading}
            onSubmitStandup={async (data) => { await submitStandup.mutateAsync(data); }}
            onLogTime={async (data) => { await logTime.mutateAsync(data); }}
            onReportBlocker={async (data) => { await reportBlocker.mutateAsync(data); }}
            onResolveBlocker={async (blockerId, notes) => {
              await resolveBlocker.mutateAsync({ blockerId, notes });
            }}
            isSubmittingStandup={submitStandup.isPending}
            isLoggingTime={logTime.isPending}
            isReportingBlocker={reportBlocker.isPending}
            isResolvingBlocker={resolveBlocker.isPending}
            teamId={selectedTeamId || undefined}
          />
        </div>
      </main>
    </div>
  );
}

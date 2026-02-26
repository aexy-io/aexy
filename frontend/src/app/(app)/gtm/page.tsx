"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Building2,
  TrendingUp,
  Eye,
  Globe,
  Settings,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMDashboard } from "@/hooks/useGTM";
import { useGTMProviders } from "@/hooks/useGTMProviders";
import { FunnelStageData, RecentVisitorRow } from "@/lib/api";

interface StatCardProps {
  title: string;
  value: number | string;
  change: number;
  icon: React.ReactNode;
}

function StatCard({ title, value, change, icon }: StatCardProps) {
  const isPositive = change >= 0;

  return (
    <div className="bg-muted/50 border border-border rounded-xl p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm font-medium">{title}</span>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="text-3xl font-bold text-foreground">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="flex items-center gap-1">
        {isPositive ? (
          <ArrowUpRight className="w-4 h-4 text-emerald-400" />
        ) : (
          <ArrowDownRight className="w-4 h-4 text-red-400" />
        )}
        <span
          className={`text-sm font-medium ${
            isPositive ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {isPositive ? "+" : ""}
          {change.toFixed(1)}%
        </span>
        <span className="text-muted-foreground text-sm ml-1">vs last period</span>
      </div>
    </div>
  );
}

function FunnelVisualization({ stages }: { stages: FunnelStageData[] }) {
  if (!stages || stages.length === 0) return null;

  const maxCount = Math.max(...stages.map((s) => s.count));

  return (
    <div className="bg-muted/50 border border-border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-foreground mb-6">
        Visitor Funnel
      </h3>
      <div className="space-y-4">
        {stages.map((stage, index) => {
          const widthPercent =
            maxCount > 0 ? (stage.count / maxCount) * 100 : 0;

          return (
            <div key={stage.stage} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground/90 font-medium">{stage.stage}</span>
                <div className="flex items-center gap-3">
                  <span className="text-foreground font-semibold">
                    {stage.count.toLocaleString()}
                  </span>
                  {index > 0 && stage.conversion_rate != null && (
                    <span className="text-muted-foreground text-xs">
                      {stage.conversion_rate.toFixed(1)}% conversion
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full bg-muted/50 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-violet-500 h-3 rounded-full transition-all duration-700"
                  style={{ width: `${Math.max(widthPercent, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatLastSeen(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function RecentVisitorsTable({ visitors }: { visitors: RecentVisitorRow[] }) {
  const statusStyles: Record<string, string> = {
    identified: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    anonymous: "bg-muted text-muted-foreground border-border",
    resolved: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Recent Visitors</h3>
        <Link
          href="/gtm/visitors"
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          View all
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">
                Company / Domain
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">
                Pages
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">
                Last Seen
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">
                Status
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">
                Duration
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {visitors.map((visitor) => (
              <tr
                key={visitor.session_id}
                className="hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => window.location.href = `/gtm/visitors/${visitor.session_id}`}
              >
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-foreground text-sm font-medium">
                      {visitor.company_name || "Unknown"}
                    </span>
                    {visitor.company_domain && (
                      <span className="text-muted-foreground text-xs">
                        {visitor.company_domain}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-foreground/90 text-sm">
                  {visitor.page_count}
                </td>
                <td className="px-6 py-4 text-muted-foreground text-sm">
                  {formatLastSeen(visitor.started_at)}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      statusStyles[visitor.identification_status] ||
                      "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {visitor.identification_status}
                  </span>
                </td>
                <td className="px-6 py-4 text-muted-foreground text-sm">
                  {visitor.page_count > 0 ? `${visitor.duration_seconds}s` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visitors.length === 0 && (
        <div className="px-6 py-12 text-center text-muted-foreground">
          No recent visitors tracked yet.
        </div>
      )}
    </div>
  );
}

export default function GTMDashboardPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const {
    overview,
    overviewLoading,
    funnel,
    funnelLoading,
    recentVisitors,
    recentVisitorsLoading,
    refetch,
  } = useGTMDashboard(workspaceId);

  const { providers } = useGTMProviders(workspaceId);

  const activeProviderCount = providers.filter(
    (p) => p.status === "active"
  ).length;

  const isLoading = overviewLoading || funnelLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-muted-foreground text-sm">
            Loading GTM Intelligence...
          </span>
        </div>
      </div>
    );
  }

  const safeOverview = {
    total_visitors: overview?.total_visitors ?? 0,
    visitors_change_pct: overview?.visitors_change_pct ?? 0,
    identified_companies: overview?.identified_companies ?? 0,
    companies_change_pct: overview?.companies_change_pct ?? 0,
    new_leads: overview?.new_leads ?? 0,
    leads_change_pct: overview?.leads_change_pct ?? 0,
    active_sequences: overview?.active_sequences ?? 0,
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <LayoutDashboard className="w-7 h-7 text-indigo-400" />
              GTM Intelligence
            </h1>
            <p className="text-muted-foreground mt-1">
              Visitor identification, enrichment, and go-to-market automation.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground/90 rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <Link
              href="/gtm/providers"
              className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground/90 rounded-lg text-sm transition-colors"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>
          </div>
        </div>

        {/* KPI Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Visitors"
            value={safeOverview.total_visitors}
            change={safeOverview.visitors_change_pct}
            icon={<Eye className="w-5 h-5" />}
          />
          <StatCard
            title="Identified Companies"
            value={safeOverview.identified_companies}
            change={safeOverview.companies_change_pct}
            icon={<Building2 className="w-5 h-5" />}
          />
          <StatCard
            title="New Leads"
            value={safeOverview.new_leads}
            change={safeOverview.leads_change_pct}
            icon={<Users className="w-5 h-5" />}
          />
          <StatCard
            title="Active Sequences"
            value={safeOverview.active_sequences}
            change={0}
            icon={<TrendingUp className="w-5 h-5" />}
          />
        </div>

        {/* Funnel + Provider Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <div className="lg:col-span-2">
            <FunnelVisualization stages={funnel ?? []} />
          </div>
          <div className="bg-muted/50 border border-border rounded-xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Provider Status
              </h3>
              <p className="text-muted-foreground text-sm mb-6">
                Data providers powering your GTM pipeline.
              </p>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <Globe className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {activeProviderCount}
                  </p>
                  <p className="text-muted-foreground text-sm">Active providers</p>
                </div>
              </div>
            </div>
            <Link
              href="/gtm/providers"
              className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Settings className="w-4 h-4" />
              Manage Providers
            </Link>
          </div>
        </div>

        {/* Recent Visitors */}
        <RecentVisitorsTable visitors={recentVisitors} />
      </div>
    </div>
  );
}

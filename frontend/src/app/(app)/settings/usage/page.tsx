"use client";

import {
  Zap,
  Crown,
  Loader2,
  Activity,
  BarChart3,
  Server,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import {
  useUsageSummary,
  useUsageEstimate,
  useLimitsUsage,
  formatCurrency,
  formatNumber,
} from "@/hooks/useBillingUsage";
import { UsageStatsCards } from "@/components/billing/UsageStatsCards";
import { UsageTrendChart } from "@/components/billing/UsageTrendChart";
import { UsageAlerts } from "@/components/billing/UsageAlert";
import { UpgradeBanner } from "@/components/UpgradeBanner";

function ProviderBreakdown() {
  const { data: usageSummary, isLoading } = useUsageSummary();

  if (isLoading || !usageSummary?.by_provider) {
    return (
      <div className="bg-muted rounded-xl border border-border p-6 animate-pulse">
        <div className="w-32 h-5 bg-accent rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-full h-12 bg-accent rounded" />
          ))}
        </div>
      </div>
    );
  }

  const providers = usageSummary.by_provider;
  const providerEntries = Object.entries(providers);
  const totalTokens = usageSummary.total_tokens || 1;

  const providerColors: Record<string, string> = {
    claude: "bg-orange-500",
    gemini: "bg-blue-500",
    ollama: "bg-green-500",
  };

  const providerLabels: Record<string, string> = {
    claude: "Claude (Anthropic)",
    gemini: "Gemini (Google)",
    ollama: "Ollama (Self-hosted)",
  };

  if (providerEntries.length === 0) {
    return (
      <div className="bg-muted rounded-xl border border-border p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          Usage by Provider
        </h3>
        <p className="text-sm text-muted-foreground text-center py-4">
          No usage data yet. Start using AI features to see provider breakdown.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-muted rounded-xl border border-border p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Server className="h-4 w-4 text-muted-foreground" />
        Usage by Provider
      </h3>
      <div className="space-y-4">
        {providerEntries.map(([provider, data]) => {
          const providerData = data as { input_tokens: number; output_tokens: number; cost_cents: number };
          const providerTotal = providerData.input_tokens + providerData.output_tokens;
          const percentage = (providerTotal / totalTokens) * 100;

          return (
            <div key={provider}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground">
                  {providerLabels[provider] || provider}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatNumber(providerTotal)} tokens ({formatCurrency(providerData.cost_cents)})
                </span>
              </div>
              <div className="w-full bg-accent rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${providerColors[provider] || "bg-primary"}`}
                  style={{ width: `${Math.max(percentage, 1)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>{formatNumber(providerData.input_tokens)} in / {formatNumber(providerData.output_tokens)} out</span>
                <span>{Math.round(percentage)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanLimitsOverview() {
  const { data: limitsData, isLoading } = useLimitsUsage();

  if (isLoading || !limitsData) {
    return (
      <div className="bg-muted rounded-xl border border-border p-6 animate-pulse">
        <div className="w-32 h-5 bg-accent rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="w-full h-8 bg-accent rounded" />
          ))}
        </div>
      </div>
    );
  }

  const limits = [
    {
      label: "Repositories",
      used: limitsData.repos?.used ?? 0,
      limit: limitsData.repos?.limit ?? 0,
      unlimited: limitsData.repos?.unlimited ?? false,
    },
    {
      label: "AI Requests Today",
      used: limitsData.llm?.used_today ?? 0,
      limit: limitsData.llm?.limit_per_day ?? 0,
      unlimited: limitsData.llm?.unlimited ?? false,
    },
    {
      label: "Monthly Tokens",
      used: limitsData.tokens?.tokens_used_this_month ?? 0,
      limit: limitsData.tokens?.free_tokens_per_month ?? 0,
      unlimited: false,
    },
  ];

  const features = [
    { label: "Real-time Sync", enabled: limitsData.features?.real_time_sync },
    { label: "Advanced Analytics", enabled: limitsData.features?.advanced_analytics },
    { label: "Exports", enabled: limitsData.features?.exports },
    { label: "Webhooks", enabled: limitsData.features?.webhooks },
    { label: "Team Features", enabled: limitsData.features?.team_features },
  ];

  return (
    <div className="bg-muted rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Plan Limits
        </h3>
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
          {limitsData.plan?.name || "Free"}
        </span>
      </div>

      <div className="space-y-3 mb-5">
        {limits.map((item) => {
          const percentage = item.unlimited ? 0 : item.limit > 0 ? Math.min((item.used / item.limit) * 100, 100) : 0;
          const isHigh = percentage >= 80;

          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-foreground">{item.label}</span>
                <span className={`text-xs ${isHigh ? "text-amber-400" : "text-muted-foreground"}`}>
                  {item.unlimited
                    ? `${formatNumber(item.used)} (unlimited)`
                    : `${formatNumber(item.used)} / ${formatNumber(item.limit)}`}
                </span>
              </div>
              {!item.unlimited && (
                <div className="w-full bg-accent rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      isHigh ? "bg-amber-500" : "bg-primary"
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-4">
        <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase">Features</h4>
        <div className="grid grid-cols-2 gap-2">
          {features.map((f) => (
            <div key={f.label} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${f.enabled ? "bg-emerald-400" : "bg-zinc-600"}`} />
              <span className={f.enabled ? "text-foreground" : "text-muted-foreground"}>
                {f.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Link
        href="/settings/plans"
        className="mt-4 flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
      >
        <Crown className="h-4 w-4" />
        Compare Plans
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export default function UsageDashboardPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  if (!workspaceId) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Usage & Limits</h1>
        </div>
        <p className="text-muted-foreground">
          Monitor your AI token consumption, plan limits, and cost projections.
        </p>
      </div>

      {/* Upgrade Banner */}
      <div className="mb-6">
        <UpgradeBanner trigger="ai_limit" />
      </div>

      {/* Usage Alerts */}
      <div className="mb-6">
        <UsageAlerts />
      </div>

      {/* Stats Cards */}
      <div className="mb-6">
        <UsageStatsCards />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <UsageTrendChart />
        </div>
        <div>
          <PlanLimitsOverview />
        </div>
      </div>

      {/* Provider Breakdown */}
      <ProviderBreakdown />
    </div>
  );
}

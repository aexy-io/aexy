"use client";

import { Coins, TrendingUp, Calendar, Activity } from "lucide-react";
import { useUsageSummary, useUsageEstimate, formatCurrency, formatNumber } from "@/hooks/useBillingUsage";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  trend?: {
    direction: "up" | "down" | "neutral";
    value: string;
  };
}

function StatCard({ icon, label, value, subValue, trend }: StatCardProps) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-slate-700 rounded-lg">
          {icon}
        </div>
        <span className="text-slate-400 text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subValue && (
            <p className="text-slate-400 text-sm mt-1">{subValue}</p>
          )}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-sm ${
            trend.direction === "up" ? "text-red-400" :
            trend.direction === "down" ? "text-green-400" :
            "text-slate-400"
          }`}>
            {trend.direction === "up" && <TrendingUp className="h-4 w-4" />}
            {trend.direction === "down" && <TrendingUp className="h-4 w-4 rotate-180" />}
            <span>{trend.value}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function UsageStatsCards() {
  const { data: usageSummary, isLoading: summaryLoading } = useUsageSummary();
  const { data: estimate, isLoading: estimateLoading } = useUsageEstimate();

  const isLoading = summaryLoading || estimateLoading;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-slate-800 rounded-xl border border-slate-700 p-6 animate-pulse">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-slate-700 rounded-lg" />
              <div className="w-24 h-4 bg-slate-700 rounded" />
            </div>
            <div className="w-32 h-8 bg-slate-700 rounded mt-2" />
            <div className="w-20 h-4 bg-slate-700 rounded mt-2" />
          </div>
        ))}
      </div>
    );
  }

  const totalTokens = usageSummary?.total_tokens || 0;
  const inputTokens = usageSummary?.total_input_tokens || 0;
  const outputTokens = usageSummary?.total_output_tokens || 0;
  const currentCost = usageSummary?.total_cost_cents || 0;
  const projectedCost = estimate?.projected_month_cost_cents || 0;
  const dailyAverage = estimate?.daily_average_cost_cents || 0;
  const daysElapsed = estimate?.days_elapsed || 0;
  const daysRemaining = estimate?.days_remaining || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={<Activity className="h-5 w-5 text-primary-400" />}
        label="Tokens Used"
        value={formatNumber(totalTokens)}
        subValue={`${formatNumber(inputTokens)} in / ${formatNumber(outputTokens)} out`}
      />

      <StatCard
        icon={<Coins className="h-5 w-5 text-green-400" />}
        label="Current Cost"
        value={formatCurrency(currentCost)}
        subValue="This billing period"
      />

      <StatCard
        icon={<TrendingUp className="h-5 w-5 text-amber-400" />}
        label="Projected Cost"
        value={formatCurrency(projectedCost)}
        subValue={`Based on ${daysElapsed} days of usage`}
        trend={projectedCost > currentCost * 1.2 ? {
          direction: "up",
          value: `+${Math.round(((projectedCost - currentCost) / Math.max(currentCost, 1)) * 100)}%`
        } : undefined}
      />

      <StatCard
        icon={<Calendar className="h-5 w-5 text-blue-400" />}
        label="Daily Average"
        value={formatCurrency(dailyAverage)}
        subValue={`${daysRemaining} days remaining`}
      />
    </div>
  );
}

export default UsageStatsCards;

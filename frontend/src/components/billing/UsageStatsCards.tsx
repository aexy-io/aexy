"use client";

import { Coins, TrendingUp, Calendar, Activity, Zap } from "lucide-react";
import { useUsageSummary, useUsageEstimate, useLimitsUsage, formatCurrency, formatNumber } from "@/hooks/useBillingUsage";

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

// Token usage card with progress bar for free tier
function TokenUsageCard() {
  const { data: limitsData, isLoading } = useLimitsUsage();

  if (isLoading || !limitsData?.tokens) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-slate-700 rounded-lg" />
          <div className="w-24 h-4 bg-slate-700 rounded" />
        </div>
        <div className="w-32 h-8 bg-slate-700 rounded mt-2" />
        <div className="w-full h-2 bg-slate-700 rounded mt-4" />
      </div>
    );
  }

  const tokens = limitsData.tokens;
  const freeTokens = tokens.free_tokens_per_month;
  const usedTokens = tokens.tokens_used_this_month;
  const freeUsed = Math.min(usedTokens, freeTokens);
  const freePercentage = freeTokens > 0 ? Math.min((freeUsed / freeTokens) * 100, 100) : 0;
  const isOverage = tokens.is_in_overage;
  const overageTokens = tokens.overage_tokens;
  const overageCost = tokens.overage_cost_cents;

  // Determine progress bar color based on usage
  const getProgressColor = () => {
    if (isOverage) return "bg-amber-500";
    if (freePercentage >= 90) return "bg-red-500";
    if (freePercentage >= 80) return "bg-amber-500";
    return "bg-primary-500";
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-slate-700 rounded-lg">
          <Zap className="h-5 w-5 text-primary-400" />
        </div>
        <span className="text-slate-400 text-sm font-medium">Token Usage</span>
      </div>

      <div className="mb-3">
        <p className="text-2xl font-bold text-white">
          {formatNumber(usedTokens)}
          <span className="text-base font-normal text-slate-400"> / {formatNumber(freeTokens)} free</span>
        </p>
        <p className="text-slate-400 text-sm mt-1">
          {formatNumber(tokens.input_tokens_this_month)} in / {formatNumber(tokens.output_tokens_this_month)} out
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
        <div
          className={`h-2 rounded-full transition-all ${getProgressColor()}`}
          style={{ width: `${freePercentage}%` }}
        />
      </div>

      {/* Status text */}
      <div className="flex justify-between items-center text-xs">
        <span className="text-slate-400">
          {isOverage ? (
            <span className="text-amber-400">
              {formatNumber(tokens.tokens_remaining_free)} free remaining
            </span>
          ) : (
            <span>
              {formatNumber(tokens.tokens_remaining_free)} tokens remaining
            </span>
          )}
        </span>
        <span className="text-slate-500">
          {Math.round(freePercentage)}% used
        </span>
      </div>

      {/* Overage info */}
      {isOverage && tokens.enable_overage_billing && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <div className="flex justify-between items-center">
            <span className="text-sm text-amber-400">Overage Usage</span>
            <span className="text-sm font-medium text-white">
              {formatNumber(overageTokens)} tokens
            </span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-sm text-slate-400">Overage Cost</span>
            <span className="text-sm font-medium text-amber-400">
              {formatCurrency(overageCost)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            ${(tokens.input_cost_per_1k_cents / 100).toFixed(2)}/1K input, ${(tokens.output_cost_per_1k_cents / 100).toFixed(2)}/1K output
          </p>
        </div>
      )}

      {/* Overage disabled (free plan at limit) */}
      {isOverage && !tokens.enable_overage_billing && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <p className="text-sm text-red-400">
            Monthly limit reached. Upgrade for more tokens.
          </p>
        </div>
      )}
    </div>
  );
}

export function UsageStatsCards() {
  const { data: usageSummary, isLoading: summaryLoading } = useUsageSummary();
  const { data: estimate, isLoading: estimateLoading } = useUsageEstimate();
  const { data: limitsData } = useLimitsUsage();

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

  const currentCost = usageSummary?.total_cost_cents || 0;
  const projectedCost = estimate?.projected_month_cost_cents || 0;
  const dailyAverage = estimate?.daily_average_cost_cents || 0;
  const daysElapsed = estimate?.days_elapsed || 0;
  const daysRemaining = estimate?.days_remaining || 0;
  const overageCost = limitsData?.tokens?.overage_cost_cents || 0;
  const totalCost = currentCost + overageCost;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Token usage with progress bar */}
      <TokenUsageCard />

      <StatCard
        icon={<Coins className="h-5 w-5 text-green-400" />}
        label="Current Cost"
        value={formatCurrency(totalCost)}
        subValue={overageCost > 0 ? `Includes ${formatCurrency(overageCost)} overage` : "This billing period"}
      />

      <StatCard
        icon={<TrendingUp className="h-5 w-5 text-amber-400" />}
        label="Projected Cost"
        value={formatCurrency(projectedCost)}
        subValue={`Based on ${daysElapsed} days of usage`}
        trend={projectedCost > totalCost * 1.2 ? {
          direction: "up",
          value: `+${Math.round(((projectedCost - totalCost) / Math.max(totalCost, 1)) * 100)}%`
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

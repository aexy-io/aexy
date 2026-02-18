"use client";

import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  trend?: {
    value: number;
    label?: string;
    isPositive?: boolean; // Override automatic positive/negative determination
  };
  loading?: boolean;
  onClick?: () => void;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-blue-400",
  iconBgColor = "bg-blue-100 dark:bg-blue-900/30",
  trend,
  loading = false,
  onClick,
}: MetricCardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return TrendingUp;
    if (trend.value < 0) return TrendingDown;
    return Minus;
  };

  const getTrendColor = () => {
    if (!trend) return "";
    // Allow override of positive/negative interpretation
    const isPositive = trend.isPositive !== undefined
      ? trend.isPositive
      : trend.value >= 0;
    return isPositive ? "text-green-400" : "text-red-400";
  };

  const TrendIcon = getTrendIcon();

  if (loading) {
    return (
      <div className="bg-muted rounded-xl p-6 border border-border animate-pulse">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-accent rounded-lg" />
          <div className="h-4 bg-accent rounded w-24" />
        </div>
        <div className="h-8 bg-accent rounded w-16 mb-2" />
        <div className="h-3 bg-accent rounded w-20" />
      </div>
    );
  }

  return (
    <div
      className={`bg-muted rounded-xl p-6 border border-border transition-colors ${
        onClick ? "cursor-pointer hover:border-border hover:bg-muted/80" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 ${iconBgColor} rounded-lg`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <span className="text-muted-foreground text-sm">{title}</span>
        </div>
        {trend && TrendIcon && (
          <div className={`flex items-center gap-1 text-xs ${getTrendColor()}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            <span>
              {trend.value > 0 ? "+" : ""}
              {trend.value}%
              {trend.label && <span className="text-muted-foreground ml-1">{trend.label}</span>}
            </span>
          </div>
        )}
      </div>
      <p className="text-3xl font-semibold text-foreground">{value}</p>
      {subtitle && (
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}

// Preset configurations for common metric types
export const metricPresets = {
  standup: {
    iconColor: "text-blue-400",
    iconBgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  time: {
    iconColor: "text-green-400",
    iconBgColor: "bg-green-100 dark:bg-green-900/30",
  },
  blocker: {
    iconColor: "text-red-400",
    iconBgColor: "bg-red-100 dark:bg-red-900/30",
  },
  score: {
    iconColor: "text-purple-400",
    iconBgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  activity: {
    iconColor: "text-amber-400",
    iconBgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
};

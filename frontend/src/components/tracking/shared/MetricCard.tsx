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
  iconBgColor = "bg-blue-900/30",
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
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 animate-pulse">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-slate-700 rounded-lg" />
          <div className="h-4 bg-slate-700 rounded w-24" />
        </div>
        <div className="h-8 bg-slate-700 rounded w-16 mb-2" />
        <div className="h-3 bg-slate-700 rounded w-20" />
      </div>
    );
  }

  return (
    <div
      className={`bg-slate-800 rounded-xl p-6 border border-slate-700 transition-colors ${
        onClick ? "cursor-pointer hover:border-slate-600 hover:bg-slate-800/80" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 ${iconBgColor} rounded-lg`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <span className="text-slate-400 text-sm">{title}</span>
        </div>
        {trend && TrendIcon && (
          <div className={`flex items-center gap-1 text-xs ${getTrendColor()}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            <span>
              {trend.value > 0 ? "+" : ""}
              {trend.value}%
              {trend.label && <span className="text-slate-500 ml-1">{trend.label}</span>}
            </span>
          </div>
        )}
      </div>
      <p className="text-3xl font-semibold text-white">{value}</p>
      {subtitle && (
        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

// Preset configurations for common metric types
export const metricPresets = {
  standup: {
    iconColor: "text-blue-400",
    iconBgColor: "bg-blue-900/30",
  },
  time: {
    iconColor: "text-green-400",
    iconBgColor: "bg-green-900/30",
  },
  blocker: {
    iconColor: "text-red-400",
    iconBgColor: "bg-red-900/30",
  },
  score: {
    iconColor: "text-purple-400",
    iconBgColor: "bg-purple-900/30",
  },
  activity: {
    iconColor: "text-amber-400",
    iconBgColor: "bg-amber-900/30",
  },
};

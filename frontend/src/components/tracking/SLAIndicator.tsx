"use client";

import { Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export type SLAStatus = "ok" | "warning" | "breached" | "resolved";

interface SLAIndicatorProps {
  reportedAt: string | Date;
  resolvedAt?: string | Date | null;
  targetHours?: number; // Target response time in hours
  warningThreshold?: number; // Percentage of target time to show warning (e.g., 0.75 = 75%)
  showTime?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const slaConfig = {
  ok: {
    icon: CheckCircle2,
    color: "text-green-400",
    bgColor: "bg-green-900/30",
    borderColor: "border-green-700/50",
    label: "On Track",
  },
  warning: {
    icon: Clock,
    color: "text-amber-400",
    bgColor: "bg-amber-900/30",
    borderColor: "border-amber-700/50",
    label: "At Risk",
  },
  breached: {
    icon: XCircle,
    color: "text-red-400",
    bgColor: "bg-red-900/30",
    borderColor: "border-red-700/50",
    label: "SLA Breached",
  },
  resolved: {
    icon: CheckCircle2,
    color: "text-slate-400",
    bgColor: "bg-slate-800",
    borderColor: "border-slate-700",
    label: "Resolved",
  },
};

const sizeConfig = {
  sm: { icon: "h-3 w-3", text: "text-xs", padding: "px-2 py-0.5" },
  md: { icon: "h-4 w-4", text: "text-sm", padding: "px-2.5 py-1" },
  lg: { icon: "h-5 w-5", text: "text-base", padding: "px-3 py-1.5" },
};

function calculateSLAStatus(
  reportedAt: Date,
  resolvedAt: Date | null,
  targetHours: number,
  warningThreshold: number
): { status: SLAStatus; hoursElapsed: number; percentUsed: number } {
  if (resolvedAt) {
    const elapsed = (resolvedAt.getTime() - reportedAt.getTime()) / (1000 * 60 * 60);
    return {
      status: "resolved",
      hoursElapsed: elapsed,
      percentUsed: (elapsed / targetHours) * 100,
    };
  }

  const now = new Date();
  const hoursElapsed = (now.getTime() - reportedAt.getTime()) / (1000 * 60 * 60);
  const percentUsed = (hoursElapsed / targetHours) * 100;

  if (hoursElapsed >= targetHours) {
    return { status: "breached", hoursElapsed, percentUsed };
  } else if (percentUsed >= warningThreshold * 100) {
    return { status: "warning", hoursElapsed, percentUsed };
  }
  return { status: "ok", hoursElapsed, percentUsed };
}

function formatDuration(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  } else if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  } else {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
}

export function SLAIndicator({
  reportedAt,
  resolvedAt,
  targetHours = 24, // Default 24 hour SLA
  warningThreshold = 0.75,
  showTime = true,
  size = "md",
  className = "",
}: SLAIndicatorProps) {
  const reportedDate = typeof reportedAt === "string" ? new Date(reportedAt) : reportedAt;
  const resolvedDate = resolvedAt
    ? typeof resolvedAt === "string"
      ? new Date(resolvedAt)
      : resolvedAt
    : null;

  const { status, hoursElapsed, percentUsed } = calculateSLAStatus(
    reportedDate,
    resolvedDate,
    targetHours,
    warningThreshold
  );

  const config = slaConfig[status];
  const sizes = sizeConfig[size];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${sizes.padding} ${config.bgColor} border ${config.borderColor} rounded-full ${className}`}
    >
      <Icon className={`${sizes.icon} ${config.color}`} />
      <span className={`${sizes.text} ${config.color} font-medium`}>
        {config.label}
        {showTime && status !== "resolved" && (
          <span className="text-slate-400 ml-1">({formatDuration(hoursElapsed)})</span>
        )}
        {showTime && status === "resolved" && (
          <span className="text-slate-400 ml-1">in {formatDuration(hoursElapsed)}</span>
        )}
      </span>
    </span>
  );
}

// Age indicator for showing how long a blocker has been open
export function BlockerAge({
  reportedAt,
  resolvedAt,
  size = "sm",
}: {
  reportedAt: string | Date;
  resolvedAt?: string | Date | null;
  size?: "sm" | "md";
}) {
  const reportedDate = typeof reportedAt === "string" ? new Date(reportedAt) : reportedAt;
  const endDate = resolvedAt
    ? typeof resolvedAt === "string"
      ? new Date(resolvedAt)
      : resolvedAt
    : new Date();

  const hoursElapsed = (endDate.getTime() - reportedDate.getTime()) / (1000 * 60 * 60);

  let color = "text-slate-400";
  if (!resolvedAt) {
    if (hoursElapsed >= 72) color = "text-red-400"; // 3+ days
    else if (hoursElapsed >= 24) color = "text-amber-400"; // 1-3 days
  }

  return (
    <span className={`${size === "sm" ? "text-xs" : "text-sm"} ${color}`}>
      {formatDuration(hoursElapsed)} {resolvedAt ? "to resolve" : "old"}
    </span>
  );
}

// SLA summary for multiple blockers
export function SLASummary({
  blockers,
  targetHours = 24,
}: {
  blockers: Array<{
    reported_at: string;
    updated_at: string;
    status: string;
  }>;
  targetHours?: number;
}) {
  const activeBlockers = blockers.filter((b) => b.status !== "resolved");

  const withinSla = activeBlockers.filter((b) => {
    const hours = (Date.now() - new Date(b.reported_at).getTime()) / (1000 * 60 * 60);
    return hours < targetHours;
  }).length;

  const breachedSla = activeBlockers.length - withinSla;
  const slaRate = activeBlockers.length > 0
    ? Math.round((withinSla / activeBlockers.length) * 100)
    : 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">SLA Compliance</span>
        <span className={`text-lg font-bold ${slaRate >= 80 ? "text-green-400" : slaRate >= 50 ? "text-amber-400" : "text-red-400"}`}>
          {slaRate}%
        </span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${slaRate >= 80 ? "bg-green-500" : slaRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${slaRate}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{withinSla} within SLA</span>
        <span>{breachedSla} breached</span>
      </div>
    </div>
  );
}

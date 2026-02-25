"use client";

import { Circle, Pause, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_STATUS_COLORS, EXECUTION_STATUS_COLORS, getStatusColor } from "@/lib/statusColors";

interface AgentStatusBadgeProps {
  isActive: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function AgentStatusBadge({
  isActive,
  size = "md",
  showLabel = true,
  className,
}: AgentStatusBadgeProps) {
  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const iconSizes = {
    sm: "h-2 w-2",
    md: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  };

  const statusKey = isActive ? "active" : "inactive";
  const color = getStatusColor(AGENT_STATUS_COLORS, statusKey);

  if (isActive) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-medium",
          color.bg,
          color.text,
          sizeClasses[size],
          className
        )}
      >
        <Circle className={cn(iconSizes[size], "fill-current")} />
        {showLabel && <span>Active</span>}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        color.bg,
        color.text,
        sizeClasses[size],
        className
      )}
    >
      <Pause className={iconSizes[size]} />
      {showLabel && <span>Inactive</span>}
    </span>
  );
}

interface ExecutionStatusBadgeProps {
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  size?: "sm" | "md";
  className?: string;
}

export function ExecutionStatusBadge({
  status,
  size = "md",
  className,
}: ExecutionStatusBadgeProps) {
  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
  };

  const statusLabels: Record<string, string> = {
    pending: "Pending",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };

  const color = getStatusColor(EXECUTION_STATUS_COLORS, status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        sizeClasses[size],
        color.bg,
        color.text,
        className
      )}
    >
      {status === "running" && (
        <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
      )}
      {statusLabels[status] || "Pending"}
    </span>
  );
}

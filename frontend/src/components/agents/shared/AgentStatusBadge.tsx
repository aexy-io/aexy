"use client";

import { Circle, Pause, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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

  if (isActive) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-medium bg-green-500/20 text-green-400",
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
        "inline-flex items-center gap-1.5 rounded-full font-medium bg-muted-foreground/20 text-muted-foreground",
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

  const statusConfig = {
    pending: {
      label: "Pending",
      className: "bg-amber-500/20 text-amber-400",
    },
    running: {
      label: "Running",
      className: "bg-blue-500/20 text-blue-400",
    },
    completed: {
      label: "Completed",
      className: "bg-green-500/20 text-green-400",
    },
    failed: {
      label: "Failed",
      className: "bg-red-500/20 text-red-400",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-muted-foreground/20 text-muted-foreground",
    },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        sizeClasses[size],
        config.className,
        className
      )}
    >
      {status === "running" && (
        <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
      )}
      {config.label}
    </span>
  );
}
